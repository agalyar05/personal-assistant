import type { Application } from "./types";
import { fromInputDate } from "./fill";

export function normalizeApplicationUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export function applicationReminderMessage(app: {
  title: string;
  kind: string;
  url?: string;
  description?: string;
  deadline?: string | null;
}): string {
  const parts = [
    `📌 ${app.kind}: ${app.title}`,
  ];
  if (app.deadline) parts.push(`Deadline: ${app.deadline}`);
  if (app.url?.trim()) parts.push(normalizeApplicationUrl(app.url));
  if (app.description?.trim()) {
    const d = app.description.trim();
    parts.push(d.length > 140 ? `${d.slice(0, 137)}…` : d);
  }
  return parts.join("\n");
}

/** Local wall time for SMS cron: YYYY-MM-DDTHH:MM:00 */
export function remindAtFromDateAndTime(
  dateYmd: string,
  timeHm = "09:00",
): string | null {
  const d = fromInputDate(dateYmd);
  if (!d) return null;
  const t = timeHm.trim() || "09:00";
  const [h, m] = t.split(":").map(Number);
  return `${d}T${String(h || 9).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00`;
}

export function daysBeforeDeadline(
  deadlineYmd: string,
  daysBefore: number,
  timeHm = "09:00",
): string | null {
  const d = fromInputDate(deadlineYmd);
  if (!d) return null;
  const [y, mo, day] = d.split("-").map(Number);
  const dt = new Date(y!, mo! - 1, day!, 12, 0, 0);
  dt.setDate(dt.getDate() - daysBefore);
  const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return remindAtFromDateAndTime(ymd, timeHm);
}

export function sortApplications(list: Application[]): Application[] {
  return [...list].sort((a, b) => {
    const ad = a.deadline || "9999";
    const bd = b.deadline || "9999";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
  });
}

export type ParsedApplicationPaste = {
  title: string;
  kind: Application["kind"] | "";
  url: string;
  description: string;
  deadline: string;
  notes: string;
};

const TITLE_NOISE =
  /^(dear|hi|hello|hey|apply\s+now|click\s+here|forwarded|from:|to:|subject:|re:|fw:|https?:)/i;

const TITLE_HINT =
  /\b(scholarship|scholarships|scholars?|fellowship|fellowships|grant|grants|award|awards|bursary|internship|internships|opportunity|program|prize|endowment)\b/i;

/** Pull title / link / deadline / short summary from a pasted blurb; blanks if missing. */
export function parseApplicationPaste(raw: string): ParsedApplicationPaste {
  const text = raw.replace(/\r/g, "").trim();
  const empty: ParsedApplicationPaste = {
    title: "",
    kind: "",
    url: "",
    description: "",
    deadline: "",
    notes: "",
  };
  if (!text) return empty;

  const lower = text.toLowerCase();
  let kind: ParsedApplicationPaste["kind"] = "";
  if (/\bscholarship\b/.test(lower)) kind = "scholarship";
  else if (/\bfellowship\b/.test(lower)) kind = "scholarship";
  else if (/\binternship\b/.test(lower)) kind = "internship";
  else if (/\bgrant\b/.test(lower)) kind = "grant";
  else if (/\b(job|position|role)\b/.test(lower)) kind = "job";
  else if (/\bprogram\b/.test(lower)) kind = "program";

  const urlMatch = text.match(/https?:\/\/[^\s)>\]]+/i);
  const url = urlMatch ? urlMatch[0].replace(/[.,;]+$/, "") : "";

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const title = extractOpportunityTitle(text, lines);

  const deadline =
    extractDeadlineYmd(text) ||
    extractDeadlineYmd(
      text.match(
        /(?:deadline|due(?:\s+date)?|apply by|closes?|submission)\s*[:\-–]?\s*([^\n]+)/i,
      )?.[1] || "",
    );

  const amount = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*(?:per\s+year|\/yr|annually|each)?)?/i);
  const notes = amount ? `Amount mentioned: ${amount[0].trim()}` : "";

  const description = summarizePaste(text, lines, {
    title,
    deadline,
    amount: amount?.[0]?.trim() || "",
  });

  return { title, kind, url, description, deadline, notes };
}

function cleanTitleCandidate(s: string): string {
  return s
    .replace(/^#+\s*/, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s*https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function scoreTitleCandidate(line: string): number {
  const s = cleanTitleCandidate(line);
  if (!s || s.length < 4) return -1;
  if (TITLE_NOISE.test(s)) return -1;
  if (/^https?:\/\//i.test(s)) return -1;
  if (/^(deadline|due|apply by|amount|award\b|eligibility|requirements?)\b/i.test(s)) {
    return -1;
  }
  // Prefer short name-like lines, not paragraphs
  if (s.length > 100) return -1;
  if (s.split(/\s+/).length > 16) return -1;

  let score = 0;
  if (TITLE_HINT.test(s)) score += 8;
  if (/\bscholar\b/i.test(s)) score += 4;
  if (/\b(named|memorial|foundation|endowed)\b/i.test(s)) score += 2;
  // "X Scholarship" / "The Foo Award" style (same line only)
  if (
    /\b[A-Z][\w'’.-]*(?:[ \t]+[A-Z][\w'’.-]*){0,6}[ \t]+(Scholarship|Scholarships|Scholars|Fellowship|Grant|Award|Program|Internship|Prize)s?\b/.test(
      s,
    )
  ) {
    score += 6;
  }
  // Title Case-ish
  const words = s.split(/\s+/);
  const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (caps >= Math.min(2, words.length) && words.length <= 12) score += 2;
  // Penalize sentence-y lines
  if (/[.!?]$/.test(s) && s.length > 40) score -= 3;
  if (/\b(you|your|please|students who|we are|looking for)\b/i.test(s)) score -= 4;
  // Prefer earlier lines slightly
  return score;
}

function extractOpportunityTitle(text: string, lines: string[]): string {
  const labeled =
    text.match(
      /(?:^|\n)\s*(?:title|name|scholarship(?:\s+name)?|opportunity|program|fellowship)\s*[:\-–]\s*(.+)/i,
    )?.[1]?.trim() || "";
  if (labeled) {
    const cleaned = cleanTitleCandidate(labeled.split(/[.|]/)[0] || labeled);
    if (cleaned) return cleaned;
  }

  // Scan all lines + short phrases that look like opportunity names
  let best = "";
  let bestScore = 0;
  for (const line of lines) {
    const score = scoreTitleCandidate(line);
    if (score > bestScore) {
      bestScore = score;
      best = cleanTitleCandidate(line);
    }
  }

  // Also try inline patterns anywhere in the blob (same line / no cross-line)
  const inline = text.match(
    /\b([A-Z][\w'’.-]*(?:[ \t]+[A-Z&][\w'’.-]*){0,8}[ \t]+(?:Scholarship|Scholarships|Scholars|Fellowship|Grant|Award|Program|Internship|Prize)s?)\b/,
  );
  if (inline?.[1]) {
    const cand = cleanTitleCandidate(inline[1]);
    const score = scoreTitleCandidate(cand) + 3;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  // Need a real opportunity-ish hit; don't fall back to greeting/first line
  if (bestScore >= 6 && best) return best;
  return "";
}

/** Short key-point summary — not the full paste. */
function summarizePaste(
  text: string,
  lines: string[],
  ctx: { title: string; deadline: string; amount: string },
): string {
  const points: string[] = [];

  if (ctx.amount) points.push(`Award: ${ctx.amount}`);

  const who =
    text.match(
      /(?:open to|intended for|eligible(?:\s+students?)?|who can apply)\s*[:\-–]?\s*([^\n.]{8,120})/i,
    )?.[1]?.trim() ||
    text.match(
      /\bfor\s*:\s*([^\n.]{8,120})/i,
    )?.[1]?.trim() ||
    text.match(
      /\b((?:undergraduate|graduate|high school|college|STEM|women|minority|first[- ]gen(?:eration)?)[^\n.]{0,80})/i,
    )?.[1]?.trim();
  if (
    who &&
    !/^(warded|warded message|applicants?\b)/i.test(who) &&
    !/^https?:/i.test(who)
  ) {
    points.push(`For: ${who.replace(/\s+/g, " ").slice(0, 100)}`);
  }

  const req =
    text.match(
      /(?:requirements?|eligibility|must(?:\s+be)?|need to)\s*[:\-–]?\s*([^\n]{8,140})/i,
    )?.[1]?.trim();
  if (req) {
    const cleaned = req
      .replace(/\s+/g, " ")
      .replace(/\bapply by\b.+$/i, "")
      .trim()
      .slice(0, 110);
    if (cleaned.length >= 8) points.push(`Need: ${cleaned}`);
  }

  // One short “what it is” sentence that isn’t the title
  const prose = text.replace(/\s+/g, " ").trim();
  const sentences = prose
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 25 && s.length < 160);
  for (const s of sentences) {
    if (ctx.title && s.includes(ctx.title)) continue;
    if (/deadline|apply by|click here|unsubscribe|forwarded|eligibility:/i.test(s)) {
      continue;
    }
    if (ctx.amount && s.includes(ctx.amount) && points.some((p) => p.startsWith("Award:"))) {
      continue;
    }
    if (/\b(scholarship|fellowship|grant|award|program|internship)\b/i.test(s)) {
      points.push(s.replace(/\s+/g, " ").trim());
      break;
    }
  }

  // Bullet-ish short lines as extras (max 2)
  let bullets = 0;
  for (const line of lines) {
    if (bullets >= 2) break;
    if (!/^[-•*]\s+/.test(line) && !/^\d+[.)]\s+/.test(line)) continue;
    const body = line.replace(/^[-•*\d.)\s]+/, "").trim();
    if (body.length < 8 || body.length > 100) continue;
    if (ctx.title && body === ctx.title) continue;
    if (points.some((p) => p.includes(body))) continue;
    points.push(body);
    bullets++;
  }

  // Dedupe / trim
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of points) {
    const key = p.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.join(" · ").length > 320) break;
  }

  let summary = out.slice(0, 4).join(" · ");
  if (summary.length > 360) summary = summary.slice(0, 357) + "…";
  return summary;
}

function extractDeadlineYmd(chunk: string): string {
  const s = chunk.trim();
  if (!s) return "";

  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (us) {
    const mo = us[1]!.padStart(2, "0");
    const day = us[2]!.padStart(2, "0");
    return `${us[3]}-${mo}-${day}`;
  }

  const months: Record<string, string> = {
    january: "01",
    jan: "01",
    february: "02",
    feb: "02",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    may: "05",
    june: "06",
    jun: "06",
    july: "07",
    jul: "07",
    august: "08",
    aug: "08",
    september: "09",
    sept: "09",
    sep: "09",
    october: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12",
  };
  const named = s.match(
    /\b(january|february|march|april|may|june|july|august|september|sept|sep|october|november|december|jan|feb|mar|apr|jun|jul|aug|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i,
  );
  if (named) {
    const mo = months[named[1]!.toLowerCase()];
    const day = named[2]!.padStart(2, "0");
    const year = named[3] || String(new Date().getFullYear());
    if (mo) return `${year}-${mo}-${day}`;
  }

  return "";
}

