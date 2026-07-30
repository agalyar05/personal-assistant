import * as db from "./db";
import type { Reminder } from "./types";
import {
  parseLocalIsoInTimezone,
  wallTimeToUtc,
  ymdInTimezone,
} from "./zoned-time";

function padTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

export function reminderIsDue(
  r: Reminder,
  now: Date,
  timeZone: string,
): boolean {
  if (r.sent) return false;
  if (r.snoozedUntil) {
    // snoozedUntil may be stored as local ISO or absolute — prefer local parse.
    const parsed = parseLocalIsoInTimezone(r.snoozedUntil, timeZone);
    const until = parsed?.utc ?? new Date(r.snoozedUntil);
    if (!Number.isNaN(until.getTime()) && now < until) return false;
  }

  if (r.frequency === "once" || !r.fireTime) {
    if (!r.remindAt) return false;
    const parsed = parseLocalIsoInTimezone(r.remindAt, timeZone);
    if (!parsed) return false;
    return now.getTime() >= parsed.utc.getTime();
  }

  const today = ymdInTimezone(now, timeZone);
  if (r.lastSent === today) return false;

  const fire = padTime(r.fireTime);
  const [fh, fm] = fire.split(":").map(Number);
  const scheduled = wallTimeToUtc(today, fh || 0, fm || 0, timeZone);
  if (now < scheduled) return false;

  // weekday from local calendar date (noon avoids DST edge weirdness)
  const [y, mo, d] = today.split("-").map(Number);
  const weekday = new Date(y!, mo! - 1, d!, 12, 0, 0).getDay();

  const freq = r.frequency.toLowerCase();
  if (freq === "daily" || freq === "every day" || freq === "everyday") {
    return true;
  }
  if (freq === "weekdays" || freq === "weekday") {
    return weekday > 0 && weekday < 6;
  }
  if (freq.startsWith("weekly:")) {
    const codes = new Set(
      freq.split(":")[1]!.toUpperCase().replace(/\s/g, "").split(","),
    );
    const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    return codes.has(map[weekday]!);
  }
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  for (const [name, wd] of Object.entries(dayMap)) {
    if (freq.includes(name)) return weekday === wd;
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
  const today = ymdInTimezone(
    new Date(),
    settings.timezone || "America/Detroit",
  );
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
