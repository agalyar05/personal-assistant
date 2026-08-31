import { google } from "googleapis";
import {
  assertAllowedRecipient,
  findGoogleVoiceReplyAddress,
  getPhoneDigitsFromEnv,
  getPhoneEmail,
  isFromMyPhone,
  isGoogleVoiceAddress,
  normalizeEmailAddress,
} from "../phone";

function oauth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN",
    );
  }
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export function gmail() {
  return google.gmail({ version: "v1", auth: oauth2Client() });
}

export function calendar() {
  return google.calendar({ version: "v3", auth: oauth2Client() });
}

export function sheets() {
  return google.sheets({ version: "v4", auth: oauth2Client() });
}

function lookbackDays(): string {
  return process.env.GMAIL_LOOKBACK_DAYS?.trim() || "1";
}

function decodeBody(payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: unknown[] | null;
}): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = Buffer.from(payload.body.data, "base64url").toString("utf8");
    // Insert newlines at block-level boundaries before stripping tags, so an
    // HTML-only email keeps the same line structure a text/plain part would
    // have — without it everything (message + footer boilerplate) collapses
    // into one run-on line and the boilerplate-stripping regex below can
    // never find the newline it splits on.
    return html
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
  }
  for (const part of payload.parts || []) {
    const text = decodeBody(part as typeof payload);
    if (text) return text;
  }
  return "";
}

export function extractInboundSmsText(message: string): string {
  if (!message) return "";
  let text = message.replace(/\r\n/g, "\n").trim();
  // Real GV footer says "To respond to this text message..." — match loosely
  // so the boilerplate (help center / legal footer) doesn't leak into the body.
  text = text.split(
    /\n(?:To respond to this (?:text )?message|Sent from my|Get the Google Voice|Text Message|Text Messaging|Standard messaging rates)/i,
  )[0].trim();
  // A second, newer GV footer variant ("YOUR ACCOUNT / HELP CENTER / HELP
  // FORUM / This email was sent to you because…") isn't newline-anchored to
  // a fixed lead-in the way the one above is, so match on its distinctive
  // phrases directly instead of requiring a preceding newline.
  text = text.split(
    /\s*(?:YOUR ACCOUNT\s*<|HELP CENTER\s*<|HELP FORUM\s*<|This email was sent to you because)/i,
  )[0].trim();

  const cleanLines = (block: string) =>
    block
      .split("\n")
      .map((raw) => raw.replace(/^>/, "").trim())
      .filter((line) => line && !/^On .+ wrote:$/.test(line));

  const looksLikeBot = (line: string) =>
    /^(Your '\.\w+' list:|Reminders:|📅|Good morning|Got it|got it|Success:|Cancelled|Snoozed|Nothing on your calendar|No active reminders)/i.test(
      line.trim(),
    );

  const segments = text.split(/\nOn .+ wrote:\n/);
  const topLines = cleanLines(segments[0] || "");
  if (topLines.length) {
    const top = topLines.join("\n");
    if (!looksLikeBot(topLines[0] || "")) return top;
  }
  for (let i = segments.length - 1; i >= 1; i--) {
    const lines = cleanLines(segments[i] || "");
    if (!lines.length) continue;
    const last = lines[lines.length - 1] || "";
    if (!looksLikeBot(last)) {
      if (lines.length > 1 && last.length <= 40) return last;
      return lines.join("\n");
    }
  }
  return topLines.join("\n") || text;
}

export type InboundText = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  internalDate: number;
};

function headerMap(
  headers: { name?: string | null; value?: string | null }[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers || []) {
    if (h.name && h.value) out[h.name] = h.value;
  }
  return out;
}

const HANDLED_LABEL = "assistant-handled";

/**
 * Cheap probe — skip thread hydration when there's nothing to do.
 * Match unread OR not-yet-labeled (Gmail may auto-mark GV mail as read).
 */
async function hasInboundCandidates(
  service: ReturnType<typeof gmail>,
): Promise<boolean> {
  const phoneDigits = getPhoneDigitsFromEnv();
  const phoneEmail = getPhoneEmail();
  const days = lookbackDays();
  const queries = [
    `(is:unread OR -label:${HANDLED_LABEL}) from:txt.voice.google.com newer_than:${days}d`,
    `(is:unread OR -label:${HANDLED_LABEL}) ${phoneDigits} newer_than:${days}d`,
    `is:unread from:${phoneEmail} newer_than:${days}d`,
  ];
  for (const q of queries) {
    const res = await service.users.messages.list({
      userId: "me",
      q,
      maxResults: 1,
    });
    if (res.data.messages?.length) return true;
  }
  return false;
}

async function collectThreadIds(
  service: ReturnType<typeof gmail>,
  maxResults = 30,
): Promise<string[]> {
  const phoneDigits = getPhoneDigitsFromEnv();
  const phoneEmail = getPhoneEmail();
  const days = lookbackDays();
  // Prefer unread / unlabeled — do not require is:unread only (GV mail is often
  // opened or auto-read in Gmail before cron runs).
  const queries = [
    `(is:unread OR -label:${HANDLED_LABEL}) from:txt.voice.google.com newer_than:${days}d`,
    `(is:unread OR -label:${HANDLED_LABEL}) from:txt.voice.google.com ${phoneDigits} newer_than:${days}d`,
    `(is:unread OR -label:${HANDLED_LABEL}) ${phoneDigits} newer_than:${days}d`,
    `is:unread from:${phoneEmail} newer_than:${days}d`,
  ];
  const lists = await Promise.all(
    queries.map((q) =>
      service.users.threads.list({
        userId: "me",
        q,
        maxResults: Math.min(maxResults, 40),
      }),
    ),
  );
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const res of lists) {
    for (const t of res.data.threads || []) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id);
        ids.push(t.id);
        if (ids.length >= maxResults) return ids;
      }
    }
  }
  return ids;
}

function findUnansweredInbounds(
  messages: {
    id?: string | null;
    internalDate?: string | null;
    labelIds?: string[] | null;
    payload?: {
      headers?: { name?: string | null; value?: string | null }[];
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown[] | null;
    } | null;
  }[],
  myEmail: string,
) {
  const sorted = [...messages].sort(
    (a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0),
  );

  let lastSentDate = 0;
  for (const msg of sorted) {
    const date = Number(msg.internalDate || 0);
    const headers = headerMap(msg.payload?.headers);
    const from = headers.From || "";
    const isSent =
      (msg.labelIds || []).includes("SENT") ||
      from.toLowerCase().includes(myEmail.toLowerCase());
    if (isSent) lastSentDate = Math.max(lastSentDate, date);
  }

  // Every inbound after our last reply — not just the newest one.
  // Multiple texts between cron runs share a GV thread and were getting dropped.
  const unanswered: typeof sorted = [];
  for (const msg of sorted) {
    const date = Number(msg.internalDate || 0);
    if (date <= lastSentDate) continue;
    const headers = headerMap(msg.payload?.headers);
    const body = decodeBody(msg.payload || {});
    const from = headers.From || "";
    const isSent =
      (msg.labelIds || []).includes("SENT") ||
      from.toLowerCase().includes(myEmail.toLowerCase());
    if (isSent) continue;
    if (
      findGoogleVoiceReplyAddress(headers, body) ||
      isFromMyPhone(from)
    ) {
      unanswered.push(msg);
    }
  }
  return unanswered;
}

export async function getIncomingTexts(): Promise<InboundText[]> {
  if (!process.env.PHONE_EMAIL?.trim()) return [];
  const service = gmail();

  // Most ticks have nothing new — avoid loading every recent thread.
  // Still pick up read-but-unhandled GV mail (not unread-only).
  if (!(await hasInboundCandidates(service))) {
    return [];
  }

  const profile = await service.users.getProfile({ userId: "me" });
  const myEmail = profile.data.emailAddress || "";
  const threadIds = await collectThreadIds(service);
  if (!threadIds.length) return [];

  const threads = await Promise.all(
    threadIds.map((threadId) =>
      service.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      }),
    ),
  );

  const incoming: InboundText[] = [];
  const seenMsg = new Set<string>();

  for (let i = 0; i < threadIds.length; i++) {
    const threadId = threadIds[i]!;
    const messages = threads[i]?.data.messages || [];
    const inbounds = findUnansweredInbounds(messages, myEmail);
    for (const inbound of inbounds) {
      if (!inbound?.id || !inbound.payload) continue;
      if (seenMsg.has(inbound.id)) continue;
      seenMsg.add(inbound.id);
      const headers = headerMap(inbound.payload.headers);
      const rawBody = decodeBody(inbound.payload).trim();
      const body = extractInboundSmsText(rawBody);
      let replyAddress = findGoogleVoiceReplyAddress(headers, rawBody);
      if (!replyAddress && isFromMyPhone(headers.From || "")) {
        replyAddress = normalizeEmailAddress(headers.From || "");
      }
      if (!replyAddress) continue;
      incoming.push({
        id: inbound.id,
        threadId,
        from: replyAddress,
        subject: headers.Subject || "",
        body,
        internalDate: Number(inbound.internalDate || 0),
      });
    }
  }
  incoming.sort((a, b) => a.internalDate - b.internalDate);
  return incoming;
}

function normalizeSmsBody(body: string): string {
  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
}

export async function sendTextReply(
  toAddress: string,
  subject: string,
  body: string,
  threadId?: string,
): Promise<void> {
  const to = assertAllowedRecipient(toAddress);
  const service = gmail();
  // Empty subject delivers more reliably as SMS via Google Voice.
  // Keep/reuse thread subjects when replying so Gmail threading stays intact.
  let subj = subject.trim();
  if (subj && threadId && !subj.toLowerCase().startsWith("re:")) {
    subj = `Re: ${subj}`;
  }
  const raw = [
    `To: ${to}`,
    `Subject: ${subj}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    normalizeSmsBody(body),
  ].join("\r\n");
  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await service.users.messages.send({
    userId: "me",
    requestBody: threadId
      ? { raw: encoded, threadId }
      : { raw: encoded },
  });
}

type VoiceThread = {
  threadId: string;
  to: string;
  subject: string;
};

/** Warm-instance cache so briefing parts / reminder bursts don't re-search Gmail. */
let voiceThreadCache: { thread: VoiceThread; fetchedAt: number } | null = null;
const VOICE_THREAD_TTL_MS = 15 * 60_000;

let handledLabelIdCache: string | null = null;

/** Find a recent GV SMS thread so proactive texts (briefing/reminders) deliver as SMS. */
async function findLatestVoiceThread(preferredTo?: string): Promise<VoiceThread | null> {
  const service = gmail();
  const phoneDigits = getPhoneDigitsFromEnv();
  const res = await service.users.threads.list({
    userId: "me",
    q: `from:txt.voice.google.com ${phoneDigits} newer_than:30d`,
    maxResults: 15,
  });
  const preferred = preferredTo
    ? normalizeEmailAddress(preferredTo)
    : "";

  for (const t of res.data.threads || []) {
    if (!t.id) continue;
    const thread = await service.users.threads.get({
      userId: "me",
      id: t.id,
      format: "full",
    });
    const messages = [...(thread.data.messages || [])].sort(
      (a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0),
    );
    for (const msg of messages) {
      const headers = headerMap(msg.payload?.headers);
      const rawBody = decodeBody(msg.payload || {});
      let addr = findGoogleVoiceReplyAddress(headers, rawBody);
      if (!addr && isFromMyPhone(headers.From || "")) {
        addr = normalizeEmailAddress(headers.From || "");
      }
      if (!addr) continue;
      const to =
        preferred && isGoogleVoiceAddress(preferred) ? preferred : addr;
      return {
        threadId: t.id,
        to,
        subject: headers.Subject || "",
      };
    }
  }
  return null;
}

async function resolveVoiceThread(preferredTo?: string): Promise<VoiceThread | null> {
  if (
    voiceThreadCache &&
    Date.now() - voiceThreadCache.fetchedAt < VOICE_THREAD_TTL_MS
  ) {
    const cached = voiceThreadCache.thread;
    if (
      !preferredTo ||
      !isGoogleVoiceAddress(normalizeEmailAddress(preferredTo)) ||
      normalizeEmailAddress(cached.to) === normalizeEmailAddress(preferredTo)
    ) {
      return cached;
    }
  }
  const thread = await findLatestVoiceThread(preferredTo);
  if (thread) {
    voiceThreadCache = { thread, fetchedAt: Date.now() };
  }
  return thread;
}

async function resolveSmsDestination(): Promise<{
  to: string;
  thread: VoiceThread | null;
}> {
  const { getSettings, updateSettings } = await import("../db");
  const settings = await getSettings();
  let to =
    process.env.GOOGLE_VOICE_REPLY_EMAIL?.trim() ||
    settings.googleVoiceReply ||
    "";
  if (!to) {
    to = getPhoneEmail();
  }
  if (
    process.env.GOOGLE_VOICE_REPLY_EMAIL?.trim() &&
    settings.googleVoiceReply !== process.env.GOOGLE_VOICE_REPLY_EMAIL.trim()
  ) {
    await updateSettings({
      googleVoiceReply: process.env.GOOGLE_VOICE_REPLY_EMAIL.trim(),
    });
  }

  const thread = await resolveVoiceThread(to);
  if (thread && settings.googleVoiceReply !== thread.to) {
    await updateSettings({ googleVoiceReply: thread.to });
  }
  return { to, thread };
}

export async function sendSms(body: string, _subject = "Message"): Promise<void> {
  const { to, thread } = await resolveSmsDestination();
  if (thread) {
    await sendTextReply(thread.to, thread.subject, body, thread.threadId);
    return;
  }
  await sendTextReply(to, "", body);
}

/** Send several SMS bodies with a short delay (GV is flaky with long multi-line texts). */
export async function sendSmsParts(parts: string[]): Promise<void> {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  if (!cleaned.length) return;

  // Resolve the GV thread once for the whole burst.
  const { to, thread } = await resolveSmsDestination();
  for (let i = 0; i < cleaned.length; i++) {
    const part = cleaned[i]!;
    if (thread) {
      await sendTextReply(thread.to, thread.subject, part, thread.threadId);
    } else {
      await sendTextReply(to, "", part);
    }
    if (i < cleaned.length - 1) {
      await new Promise((r) =>
        setTimeout(r, Number(process.env.GV_SEND_DELAY_MS || 1500)),
      );
    }
  }
}

export async function sendUserReply(
  toAddress: string,
  subject: string,
  reply: string | { smsParts: string[] },
  threadId: string,
): Promise<void> {
  if (typeof reply === "object" && "smsParts" in reply) {
    for (const part of reply.smsParts) {
      await sendTextReply(toAddress, subject, part, threadId);
      await new Promise((r) =>
        setTimeout(r, Number(process.env.GV_SEND_DELAY_MS || 1500)),
      );
    }
    return;
  }
  await sendTextReply(toAddress, subject, reply, threadId);
}

async function ensureHandledLabelId(
  service: ReturnType<typeof gmail>,
): Promise<string | undefined> {
  if (handledLabelIdCache) return handledLabelIdCache;
  const labels = await service.users.labels.list({ userId: "me" });
  let labelId = labels.data.labels?.find((l) => l.name === HANDLED_LABEL)?.id;
  if (!labelId) {
    const created = await service.users.labels.create({
      userId: "me",
      requestBody: { name: HANDLED_LABEL },
    });
    labelId = created.data.id || undefined;
  }
  if (labelId) handledLabelIdCache = labelId;
  return labelId;
}

export async function markMessageHandled(messageId: string): Promise<void> {
  const service = gmail();
  const labelId = await ensureHandledLabelId(service);
  await service.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
      addLabelIds: labelId ? [labelId] : [],
    },
  });
}

export async function markThreadHandled(threadId: string): Promise<void> {
  const service = gmail();
  const labelId = await ensureHandledLabelId(service);
  if (!labelId) return;
  const thread = await service.users.threads.get({ userId: "me", id: threadId });
  for (const msg of thread.data.messages || []) {
    if (!msg.id) continue;
    await service.users.messages.modify({
      userId: "me",
      id: msg.id,
      requestBody: {
        removeLabelIds: ["UNREAD"],
        addLabelIds: [labelId],
      },
    });
  }
}

export async function saveGoogleVoiceReply(address: string): Promise<void> {
  const { updateSettings } = await import("../db");
  await updateSettings({ googleVoiceReply: normalizeEmailAddress(address) });
  voiceThreadCache = null;
}
