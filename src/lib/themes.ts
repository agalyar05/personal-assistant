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

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
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

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const raw = hex.replace("#", "").trim();
  const full = expandHex(raw);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

type HueBand = { start: number; span: number };

/**
 * Full spectrum, red through dark purple (0°-280°) — every theme spreads
 * class colors across the same wide range. Only saturation/lightness (see
 * mutedChipParams) is theme-tuned, so chips still read as "on brand".
 */
const FULL_SPECTRUM_BAND: HueBand = { start: 0, span: 280 };

function themeHueBand(_theme: UiThemeSettings): HueBand {
  return FULL_SPECTRUM_BAND;
}

function mutedChipParams(theme: UiThemeSettings): { sat: number; lit: number } {
  const accent = hexToHsl(resolveThemeColors(theme).accent);
  return {
    sat: clamp((accent.s || 40) * 0.55, 22, 38),
    lit: clamp(Math.max(accent.l || 40, 44), 42, 56),
  };
}

/** Position of a hue along the theme band [0, span]. */
function bandPosition(h: number, band: HueBand): number {
  const d = (h - band.start + 360) % 360;
  // Outside the band → clamp to nearest end
  if (d > band.span) {
    const pastEnd = d - band.span;
    const beforeStart = 360 - d;
    return pastEnd <= beforeStart ? band.span : 0;
  }
  return d;
}

function chipAtBandPos(
  theme: UiThemeSettings,
  pos: number,
  seed: number,
): string {
  const band = themeHueBand(theme);
  const { sat, lit } = mutedChipParams(theme);
  const p = clamp(pos, 0, band.span);
  const h = (band.start + p) % 360;
  const l = clamp(lit + (seed % 3) * 4 - 4, 38, 58);
  const s = clamp(sat + (seed % 2) * 5, 20, 42);
  return hslToHex(h, s, l);
}

/**
 * Next class color: expand from either end of the hues already in use
 * (within the theme band). Never reshuffles existing colors.
 */
export function nextUnusedClassColor(
  theme: UiThemeSettings,
  usedHexes: string[],
): string {
  const band = themeHueBand(theme);
  const usedNorm = [
    ...new Set(
      usedHexes.map(normalizeHex).filter(Boolean) as string[],
    ),
  ];

  if (!usedNorm.length) {
    return chipAtBandPos(theme, band.span * 0.5, 0);
  }

  const positions = usedNorm
    .map((hex) => bandPosition(hexToHsl(hex).h, band))
    .sort((a, b) => a - b);
  const minP = positions[0]!;
  const maxP = positions[positions.length - 1]!;

  // Keep neighbors distinguishable as the set grows.
  const minGap = Math.max(14, band.span / Math.max(7, usedNorm.length + 2));

  const candidates: number[] = [];
  // Prefer expanding the current span at either end.
  candidates.push(minP - minGap);
  candidates.push(maxP + minGap);
  // Snap to band edges when close.
  if (minP > 4) candidates.push(0);
  if (maxP < band.span - 4) candidates.push(band.span);
  // Largest interior gaps (fallback when ends are packed).
  for (let i = 0; i < positions.length - 1; i++) {
    const lo = positions[i]!;
    const hi = positions[i + 1]!;
    if (hi - lo >= minGap * 1.6) {
      candidates.push((lo + hi) / 2);
    }
  }
  // Dense fill: sample the band.
  for (let i = 0; i <= 12; i++) {
    candidates.push((band.span * i) / 12);
  }

  function minDist(p: number): number {
    const cp = clamp(p, 0, band.span);
    return Math.min(...positions.map((x) => Math.abs(x - cp)));
  }

  let bestPos = band.span * 0.5;
  let bestDist = -1;
  for (const raw of candidates) {
    const p = clamp(raw, 0, band.span);
    const d = minDist(p);
    // Prefer end expansion when tied: reward positions outside current [min,max].
    const endBonus = p < minP - 0.5 || p > maxP + 0.5 ? 0.5 : 0;
    const score = d + endBonus;
    if (score > bestDist) {
      bestDist = score;
      bestPos = p;
    }
  }

  let hex = chipAtBandPos(theme, bestPos, usedNorm.length);
  // If we collided with a used hex (quantization), nudge along the band.
  const usedSet = new Set(usedNorm);
  if (usedSet.has(normalizeHex(hex))) {
    for (const delta of [minGap, -minGap, minGap * 1.5, -minGap * 1.5, 8, -8]) {
      const nudged = chipAtBandPos(
        theme,
        bestPos + delta,
        usedNorm.length + 1,
      );
      if (!usedSet.has(normalizeHex(nudged))) {
        hex = nudged;
        break;
      }
    }
  }
  return hex;
}

/**
 * Swatches for the Groups picker: every in-use color (so selection shows)
 * plus a few unused suggestions grown from the ends — existing hues never move.
 */
export function classSwatchPalette(
  theme: UiThemeSettings,
  usedHexes: string[],
  extraUnused = 4,
): string[] {
  const band = themeHueBand(theme);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of usedHexes) {
    const n = normalizeHex(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  const working = [...out];
  for (let i = 0; i < Math.max(0, extraUnused); i++) {
    const next = nextUnusedClassColor(theme, working);
    const n = normalizeHex(next);
    if (!n || seen.has(n)) break;
    seen.add(n);
    working.push(n);
    out.push(n);
  }

  return out.sort(
    (a, b) =>
      bandPosition(hexToHsl(a).h, band) - bandPosition(hexToHsl(b).h, band),
  );
}

/**
 * Build `count` muted chips by growing from the band center toward both ends.
 * Index 0 is always the center; adding slots does not move earlier indices.
 */
export function classPaletteForTheme(
  theme: UiThemeSettings,
  count: number,
): string[] {
  const n = Math.max(1, Math.floor(count));
  const band = themeHueBand(theme);
  const out: string[] = [];
  // Center first, then alternate low/high expansion (stable under growth).
  for (let i = 0; i < n; i++) {
    let pos: number;
    if (i === 0) {
      pos = band.span * 0.5;
    } else {
      const step = band.span / (2 * Math.ceil(i / 2) + 2);
      const k = Math.ceil(i / 2);
      pos =
        i % 2 === 1
          ? band.span * 0.5 - k * step
          : band.span * 0.5 + k * step;
    }
    out.push(chipAtBandPos(theme, pos, i));
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
