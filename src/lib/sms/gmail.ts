import { google } from "googleapis";
import {
  assertAllowedRecipient,
  findGoogleVoiceReplyAddress,
  getPhoneDigitsFromEnv,
  getPhoneEmail,
  isFromMyPhone,
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
    return html.replace(/<[^>]+>/g, " ");
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
  text = text.split(
    /\n(?:To respond to this message|Sent from my|Get the Google Voice|Text Message|Text Messaging|Standard messaging rates)/i,
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

async function collectThreadIds(
  service: ReturnType<typeof gmail>,
  maxResults = 30,
): Promise<string[]> {
  const phoneDigits = getPhoneDigitsFromEnv();
  const phoneEmail = getPhoneEmail();
  const days = process.env.GMAIL_LOOKBACK_DAYS?.trim() || "7";
  const queries = [
    `is:unread ${phoneDigits} newer_than:${days}d`,
    `from:txt.voice.google.com newer_than:${days}d`,
    `from:txt.voice.google.com ${phoneDigits} newer_than:${days}d`,
    `from:${phoneEmail} newer_than:${days}d`,
  ];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const q of queries) {
    const res = await service.users.threads.list({
      userId: "me",
      q,
      maxResults: Math.min(maxResults, 40),
    });
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

function findUnansweredInbound(
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
  let lastInbound: (typeof sorted)[0] | null = null;
  let lastInboundDate = 0;
  let lastSentDate = 0;
  for (const msg of sorted) {
    const date = Number(msg.internalDate || 0);
    const headers = headerMap(msg.payload?.headers);
    const body = decodeBody(msg.payload || {});
    const from = headers.From || "";
    const isSent =
      (msg.labelIds || []).includes("SENT") ||
      from.toLowerCase().includes(myEmail.toLowerCase());
    if (isSent) {
      lastSentDate = Math.max(lastSentDate, date);
    } else if (
      findGoogleVoiceReplyAddress(headers, body) ||
      isFromMyPhone(from)
    ) {
      lastInbound = msg;
      lastInboundDate = date;
    }
  }
  if (!lastInbound || lastInboundDate <= lastSentDate) return null;
  return lastInbound;
}

export async function getIncomingTexts(): Promise<InboundText[]> {
  if (!process.env.PHONE_EMAIL?.trim()) return [];
  const service = gmail();
  const profile = await service.users.getProfile({ userId: "me" });
  const myEmail = profile.data.emailAddress || "";
  const threadIds = await collectThreadIds(service);
  const incoming: InboundText[] = [];

  for (const threadId of threadIds) {
    const thread = await service.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });
    const messages = thread.data.messages || [];
    const inbound = findUnansweredInbound(messages, myEmail);
    if (!inbound?.id || !inbound.payload) continue;
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
  const subj = subject.toLowerCase().startsWith("re:")
    ? subject
    : `Re: ${subject}`;
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

export async function sendSms(body: string, subject = "Message"): Promise<void> {
  const { getSettings, updateSettings } = await import("../db");
  const settings = await getSettings();
  let to =
    process.env.GOOGLE_VOICE_REPLY_EMAIL?.trim() ||
    settings.googleVoiceReply ||
    "";
  if (!to) {
    // fall back to phone email (may not deliver as SMS via GV)
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
  await sendTextReply(to, subject, body);
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

export async function markThreadHandled(threadId: string): Promise<void> {
  const service = gmail();
  const labelName = "assistant-handled";
  const labels = await service.users.labels.list({ userId: "me" });
  let labelId = labels.data.labels?.find((l) => l.name === labelName)?.id;
  if (!labelId) {
    const created = await service.users.labels.create({
      userId: "me",
      requestBody: { name: labelName },
    });
    labelId = created.data.id || undefined;
  }
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
}
