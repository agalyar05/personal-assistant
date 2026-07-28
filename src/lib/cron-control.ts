import type { CronControlSettings } from "./types";

function parseHm(value: string): { h: number; m: number } {
  const [h, m] = value.split(":").map((x) => parseInt(x, 10));
  return { h: h || 0, m: m || 0 };
}

function localParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  let hour = parseInt(parts.hour || "0", 10);
  if (hour === 24) hour = 0;
  return {
    weekday: weekdayMap[parts.weekday || "Sun"] ?? 0,
    hour,
    minute: parseInt(parts.minute || "0", 10),
  };
}

/** True when cron should run full SMS sync / AI / reminders. */
export function isCronActive(
  control: CronControlSettings,
  now = new Date(),
): { active: boolean; reason: string } {
  if (control.liveUntil) {
    const until = new Date(control.liveUntil);
    if (!Number.isNaN(until.getTime()) && now < until) {
      return { active: true, reason: "liveUntil override" };
    }
  }

  if (control.mode === "off") {
    return { active: false, reason: "cron mode is off" };
  }
  if (control.mode === "always") {
    return { active: true, reason: "cron mode is always" };
  }

  // window mode
  const tz = control.timezone || "America/Detroit";
  const { weekday, hour, minute } = localParts(now, tz);
  if (!control.daysOfWeek.includes(weekday)) {
    return { active: false, reason: `outside selected days (${weekday})` };
  }

  const start = parseHm(control.windowStart || "07:00");
  const end = parseHm(control.windowEnd || "24:00");
  const mins = hour * 60 + minute;
  const startMins = start.h * 60 + start.m;
  let endMins = end.h * 60 + end.m;
  if (control.windowEnd === "24:00" || end.h === 24) endMins = 24 * 60;

  if (startMins === endMins) {
    return { active: true, reason: "full-day window" };
  }
  if (startMins < endMins) {
    const ok = mins >= startMins && mins < endMins;
    return {
      active: ok,
      reason: ok
        ? `inside window ${control.windowStart}–${control.windowEnd}`
        : `outside window ${control.windowStart}–${control.windowEnd}`,
    };
  }
  // overnight window
  const ok = mins >= startMins || mins < endMins;
  return {
    active: ok,
    reason: ok ? "inside overnight window" : "outside overnight window",
  };
}
