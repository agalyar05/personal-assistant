/** Spreadsheet-style fill: titles "Assignment 1" → 2,3… and date series. */

const TITLE_NUM_RE = /^(.*?)(\d+)(\D*)$/;

export function fillTitleSeries(seed: string, count: number): string[] {
  const m = seed.trim().match(TITLE_NUM_RE);
  if (!m) {
    return Array.from({ length: count }, (_, i) =>
      i === 0 ? seed : `${seed} ${i + 1}`,
    );
  }
  const prefix = m[1] ?? "";
  const start = Number(m[2]);
  const suffix = m[3] ?? "";
  const width = (m[2] || "").length;
  return Array.from({ length: count }, (_, i) => {
    const n = start + i;
    const num = width > 1 ? String(n).padStart(width, "0") : String(n);
    return `${prefix}${num}${suffix}`;
  });
}

/** Infer step from first two dates; default weekly (+7d) if only one seed. */
export function fillDateSeries(
  seeds: (string | null)[],
  count: number,
  mode: "auto" | "daily" | "weekly" = "auto",
): (string | null)[] {
  const first = seeds.find((s) => s)?.trim();
  if (!first) return Array.from({ length: count }, () => null);

  const d0 = parseLocalDateTime(first);
  if (!d0) return Array.from({ length: count }, () => null);

  let stepDays = 7;
  if (mode === "daily") stepDays = 1;
  else if (mode === "weekly") stepDays = 7;
  else if (seeds.length >= 2 && seeds[1]) {
    const d1 = parseLocalDateTime(seeds[1]);
    if (d1) {
      const diff = Math.round(
        (d1.getTime() - d0.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (diff !== 0) stepDays = diff;
    }
  }

  const hasTime = /T\d{2}:\d{2}/.test(first) || /\d{1,2}:\d{2}/.test(first);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(d0);
    d.setDate(d.getDate() + stepDays * i);
    return formatLocalDateTime(d, hasTime);
  });
}

export function parseLocalDateTime(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD or YYYY-MM-DDTHH:MM
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 23),
      Number(m[5] || 59),
      Number(m[6] || 0),
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocalDateTime(d: Date, withTime: boolean): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (!withTime) return `${y}-${mo}-${day}`;
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

export function toInputDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 16);
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

export function fromInputDateTime(local: string): string | null {
  if (!local.trim()) return null;
  const d = parseLocalDateTime(local);
  return d ? d.toISOString() : null;
}
