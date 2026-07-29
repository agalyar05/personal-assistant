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

/** Pull title / link / deadline / description from a pasted blurb; blanks if missing. */
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
  else if (/\binternship\b/.test(lower)) kind = "internship";
  else if (/\bgrant\b/.test(lower)) kind = "grant";
  else if (/\b(job|position|role)\b/.test(lower)) kind = "job";
  else if (/\bprogram\b/.test(lower)) kind = "program";

  const urlMatch = text.match(/https?:\/\/[^\s)>\]]+/i);
  const url = urlMatch ? urlMatch[0].replace(/[.,;]+$/, "") : "";

  const labeledTitle =
    text.match(
      /(?:^|\n)\s*(?:title|name|scholarship|opportunity|program)\s*[:\-–]\s*(.+)/i,
    )?.[1]?.trim() || "";

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let title = labeledTitle;
  if (!title) {
    const first = lines.find(
      (l) =>
        !/^https?:\/\//i.test(l) &&
        !/^(deadline|due|apply by|amount|award|eligibility)/i.test(l),
    );
    title = (first || "").replace(/^#+\s*/, "").slice(0, 120);
  }
  // Strip trailing URL from title line
  title = title.replace(/\s*https?:\/\/\S+/i, "").trim();

  const deadline =
    extractDeadlineYmd(text) ||
    extractDeadlineYmd(
      text.match(
        /(?:deadline|due(?:\s+date)?|apply by|closes?|submission)\s*[:\-–]?\s*([^\n]+)/i,
      )?.[1] || "",
    );

  const descBits: string[] = [];
  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) continue;
    if (title && line === title) continue;
    if (/^(deadline|due|apply by)/i.test(line) && deadline) continue;
    descBits.push(line);
  }
  let description = descBits.join("\n").trim();
  if (description.length > 1200) description = description.slice(0, 1197) + "…";
  // Don't duplicate title as whole description
  if (description === title) description = "";

  const amount = text.match(/\$[\d,]+(?:\.\d{2})?/);
  const notes = amount ? `Amount mentioned: ${amount[0]}` : "";

  return { title, kind, url, description, deadline, notes };
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

