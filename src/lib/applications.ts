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
