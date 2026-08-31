import type { ThemeColors, ThemeId, UiThemeSettings } from "./types";
import { DEFAULT_THEME_CUSTOM } from "./types";

export const THEME_PRESETS: Record<
  Exclude<ThemeId, "custom">,
  { label: string; colors: ThemeColors }
> = {
  harbor: {
    label: "Harbor",
    colors: {
      bg: "#eef4f1",
      ink: "#14221f",
      muted: "#5f736c",
      card: "#f7fbf9",
      accent: "#0f766e",
      accentSoft: "#cceedf",
      line: "#d5e4dd",
    },
  },
  meadow: {
    label: "Meadow",
    colors: {
      bg: "#f1f5eb",
      ink: "#1a2414",
      muted: "#6b7a5c",
      card: "#fbfef7",
      accent: "#4d7c0f",
      accentSoft: "#ecfccb",
      line: "#dde6cf",
    },
  },
  sunset: {
    label: "Sunset",
    colors: {
      bg: "#faf3ee",
      ink: "#2a1810",
      muted: "#8a6a5a",
      card: "#fffaf6",
      accent: "#c2410c",
      accentSoft: "#ffedd5",
      line: "#ead9cd",
    },
  },
  slate: {
    label: "Slate",
    colors: {
      bg: "#e8eef4",
      ink: "#0f172a",
      muted: "#64748b",
      card: "#f8fafc",
      accent: "#334155",
      accentSoft: "#e2e8f0",
      line: "#cbd5e1",
    },
  },
};

export function resolveThemeColors(theme: UiThemeSettings): ThemeColors {
  if (theme.id === "custom") {
    return { ...DEFAULT_THEME_CUSTOM, ...theme.custom };
  }
  return THEME_PRESETS[theme.id]?.colors || THEME_PRESETS.harbor.colors;
}

export function themeToCssVars(colors: ThemeColors): Record<string, string> {
  return {
    "--bg": colors.bg,
    "--ink": colors.ink,
    "--muted": colors.muted,
    "--card": colors.card,
    "--accent": colors.accent,
    "--accent-soft": colors.accentSoft,
    "--line": colors.line,
  };
}

/** `abc` -> `aabbcc`; pads/truncates anything else to 6 chars. */
function expandHex(raw: string): string {
  return raw.length === 3
    ? raw
        .split("")
        .map((c) => c + c)
        .join("")
    : raw.padEnd(6, "0").slice(0, 6);
}

/** Canonical `#rrggbb` lowercase, or "" if invalid. */
export function normalizeHex(hex: string): string {
  const raw = String(hex || "")
    .replace("#", "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  const full = expandHex(raw);
  if (!/^[0-9a-f]{6}$/.test(full)) return "";
  return `#${full}`;
}

export function hexesEqual(a: string, b: string): boolean {
  const na = normalizeHex(a);
  const nb = normalizeHex(b);
  return Boolean(na && nb && na === nb);
}

/** Google Calendar's named color palette — the fixed set of options for
 * class/group colors (Groups picker swatches, and auto-assign for a newly
 * created class). Order matches Google Calendar's own color picker. */
export const GOOGLE_CALENDAR_COLORS: { name: string; hex: string }[] = [
  { name: "Cocoa", hex: "#795548" },
  { name: "Flamingo", hex: "#E67C73" },
  { name: "Tomato", hex: "#D50000" },
  { name: "Tangerine", hex: "#F4511E" },
  { name: "Pumpkin", hex: "#EF6C00" },
  { name: "Mango", hex: "#F09300" },
  { name: "Eucalyptus", hex: "#009688" },
  { name: "Basil", hex: "#0B8043" },
  { name: "Pistachio", hex: "#7CB342" },
  { name: "Avocado", hex: "#C0CA33" },
  { name: "Citron", hex: "#E4C441" },
  { name: "Banana", hex: "#F6BF26" },
  { name: "Sage", hex: "#33B679" },
  { name: "Peacock", hex: "#039BE5" },
  { name: "Cobalt", hex: "#4285F4" },
  { name: "Blueberry", hex: "#3F51B5" },
  { name: "Lavender", hex: "#7986CB" },
  { name: "Wisteria", hex: "#B39DDB" },
  { name: "Graphite", hex: "#616161" },
  { name: "Birch", hex: "#A79B8E" },
  { name: "Radicchio", hex: "#AD1457" },
  { name: "Cherry Blossom", hex: "#D81B60" },
  { name: "Grape", hex: "#8E24AA" },
  { name: "Amethyst", hex: "#9E69AF" },
];

/** Name for a hex if it's one of the Google Calendar colors, else null. */
export function googleCalendarColorName(hex: string): string | null {
  const n = normalizeHex(hex);
  return GOOGLE_CALENDAR_COLORS.find((c) => normalizeHex(c.hex) === n)?.name ?? null;
}

/**
 * Next class color for a newly created class: the first Google Calendar
 * color not already in use, or — once every color is taken — whichever one
 * has the fewest classes on it.
 */
export function nextUnusedClassColor(usedHexes: string[]): string {
  const used = usedHexes.map(normalizeHex).filter(Boolean);
  const usedSet = new Set(used);
  const firstUnused = GOOGLE_CALENDAR_COLORS.find(
    (c) => !usedSet.has(normalizeHex(c.hex)),
  );
  if (firstUnused) return firstUnused.hex;

  const counts = new Map<string, number>();
  for (const hex of used) counts.set(hex, (counts.get(hex) || 0) + 1);
  let best = GOOGLE_CALENDAR_COLORS[0]!;
  let bestCount = Infinity;
  for (const c of GOOGLE_CALENDAR_COLORS) {
    const count = counts.get(normalizeHex(c.hex)) || 0;
    if (count < bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best.hex;
}

/**
 * Swatches for the Groups picker: the full Google Calendar palette, plus
 * any currently-used color that isn't part of it (e.g. picked via the
 * custom color input) so its "selected" state still shows.
 */
export function classSwatchPalette(usedHexes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of GOOGLE_CALENDAR_COLORS) {
    const n = normalizeHex(c.hex);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  for (const raw of usedHexes) {
    const n = normalizeHex(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Soft wash of a class color for sheet row backgrounds. */
export function faintClassTint(hex: string, alpha = 0.14): string {
  const raw = hex.replace("#", "").trim();
  const full = expandHex(raw);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "transparent";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
