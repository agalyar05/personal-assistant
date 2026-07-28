import * as db from "./db";
import type { Reminder } from "./types";

function localNow(timeZone: string): Date {
  // Approximate local wall-clock via formatting (good enough for due checks)
  const s = new Date().toLocaleString("en-US", { timeZone });
  return new Date(s);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function padTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

export function reminderIsDue(r: Reminder, now: Date, timeZone: string): boolean {
  if (r.sent) return false;
  if (r.snoozedUntil) {
    const until = new Date(r.snoozedUntil);
    if (!Number.isNaN(until.getTime()) && now < until) return false;
  }

  if (r.frequency === "once" || !r.fireTime) {
    if (!r.remindAt) return false;
    const clean = r.remindAt.replace(/Z$/, "").replace(/\+00:00$/, "");
    const dueAt = new Date(clean);
    if (Number.isNaN(dueAt.getTime())) return false;
    const nowLocal = localNow(timeZone);
    return nowLocal >= dueAt;
  }

  const today = ymd(localNow(timeZone));
  if (r.lastSent === today) return false;
  const fire = padTime(r.fireTime);
  const nowLocal = localNow(timeZone);
  const [fh, fm] = fire.split(":").map(Number);
  const scheduled = new Date(nowLocal);
  scheduled.setHours(fh, fm, 0, 0);
  if (nowLocal < scheduled) return false;

  const freq = r.frequency.toLowerCase();
  if (freq === "daily" || freq === "every day" || freq === "everyday") return true;
  if (freq === "weekdays" || freq === "weekday") return nowLocal.getDay() > 0 && nowLocal.getDay() < 6;
  if (freq.startsWith("weekly:")) {
    const codes = new Set(
      freq.split(":")[1].toUpperCase().replace(/\s/g, "").split(","),
    );
    const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    return codes.has(map[nowLocal.getDay()]);
  }
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  for (const [name, wd] of Object.entries(dayMap)) {
    if (freq.includes(name)) return nowLocal.getDay() === wd;
  }
  return false;
}

export async function getDueReminders(): Promise<Reminder[]> {
  const settings = await db.getSettings();
  const tz = settings.timezone || "America/Detroit";
  const now = new Date();
  const all = await db.getReminders();
  return all.filter((r) => reminderIsDue(r, now, tz));
}

export async function markReminderSent(id: string): Promise<void> {
  const settings = await db.getSettings();
  const today = ymd(localNow(settings.timezone || "America/Detroit"));
  const r = (await db.getReminders()).find((x) => x.id === id);
  if (!r) return;
  if (r.frequency === "once" || !r.fireTime) {
    await db.updateReminder(id, { sent: true, lastSent: today });
  } else {
    await db.updateReminder(id, { lastSent: today, snoozedUntil: null });
  }
}

export async function listRemindersParts(): Promise<string[]> {
  const reminders = await db.getReminders();
  if (!reminders.length) return ["No active reminders."];
  const lines = reminders.map((r) => {
    const detail =
      r.frequency === "once"
        ? r.remindAt || "one-time"
        : r.fireTime
          ? `${r.frequency} at ${r.fireTime}`
          : r.frequency;
    return `- ${r.message} (${detail})`;
  });
  return ["Reminders:", ...lines];
}
