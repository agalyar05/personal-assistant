/** Timezone-aware wall-clock helpers (Vercel runs in UTC). */

export function ymdInTimezone(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function localHourMinute(
  date: Date,
  timeZone: string,
): { hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  let hour = parseInt(parts.hour || "0", 10);
  if (hour === 24) hour = 0;
  return {
    hour,
    minute: parseInt(parts.minute || "0", 10),
    second: parseInt(parts.second || "0", 10),
  };
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + days, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** UTC instant for Y-M-D HH:MM[:SS] wall time in `timeZone`. */
export function wallTimeToUtc(
  ymd: string,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0,
): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  let ms = Date.UTC(y!, mo! - 1, d!, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .formatToParts(new Date(ms))
        .map((p) => [p.type, p.value]),
    );
    let ph = parseInt(parts.hour || "0", 10);
    if (ph === 24) ph = 0;
    const asIf = Date.UTC(
      parseInt(parts.year!, 10),
      parseInt(parts.month!, 10) - 1,
      parseInt(parts.day!, 10),
      ph,
      parseInt(parts.minute!, 10),
      parseInt(parts.second || "0", 10),
    );
    const want = Date.UTC(y!, mo! - 1, d!, hour, minute, second);
    ms += want - asIf;
  }
  return new Date(ms);
}

/**
 * Parse a local datetime string (no Z) as wall time in `timeZone`.
 * Accepts `YYYY-MM-DDTHH:MM`, `YYYY-MM-DDTHH:MM:SS`, or space separator.
 */
export function parseLocalIsoInTimezone(
  raw: string,
  timeZone: string,
): { utc: Date; normalized: string } | null {
  const clean = raw
    .trim()
    .replace(/Z$/i, "")
    .replace(/[+-]\d{2}:?\d{2}$/, "")
    .replace(" ", "T");
  const m = clean.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) return null;
  const ymd = `${m[1]}-${m[2]}-${m[3]}`;
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || 0);
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }
  const utc = wallTimeToUtc(ymd, hour, minute, timeZone, second);
  const normalized = `${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  return { utc, normalized };
}

export function formatLocalDateTimeNice(
  date: Date,
  timeZone: string,
): string {
  return date.toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Current local wall clock string for LLM context. */
export function formatNowForPrompt(timeZone: string, now = new Date()): string {
  const ymd = ymdInTimezone(now, timeZone);
  const { hour, minute } = localHourMinute(now, timeZone);
  const tomorrow = addDaysYmd(ymd, 1);
  return (
    `Current local datetime: ${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00 (${timeZone}). ` +
    `Today is ${ymd}. Tomorrow is ${tomorrow}.`
  );
}
