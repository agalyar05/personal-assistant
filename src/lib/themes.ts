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

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.padEnd(6, "0").slice(0, 6);
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

/** Theme-tuned hue bands — muted chips stay on-palette instead of rainbow. */
const THEME_HUE_BAND: Record<ThemeId, { start: number; span: number }> = {
  harbor: { start: 150, span: 130 }, // seafoam → deep teal → slate-blue
  meadow: { start: 60, span: 115 }, // olive → leaf → pine
  sunset: { start: 355, span: 75 }, // warm rose → clay → amber
  slate: { start: 195, span: 115 }, // steel → ink-blue → soft violet
  custom: { start: 160, span: 130 },
};

/**
 * Build `count` muted, theme-fitting chip colors that stay distinguishable.
 */
export function classPaletteForTheme(
  theme: UiThemeSettings,
  count: number,
): string[] {
  const n = Math.max(1, Math.floor(count));
  const resolved = resolveThemeColors(theme);
  const accent = hexToHsl(resolved.accent);
  const band =
    theme.id === "custom"
      ? {
          start: ((accent.h || 160) - 50 + 360) % 360,
          span: 130,
        }
      : THEME_HUE_BAND[theme.id];

  // Soft / dusty — readable as chips, not neon.
  const satBase = clamp((accent.s || 40) * 0.55, 22, 38);
  const litBase = clamp(Math.max(accent.l || 40, 44), 42, 56);

  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const h = (band.start + t * band.span) % 360;
    // Stagger lightness so neighbors stay distinct even when hues are close.
    const l = clamp(litBase + (i % 3) * 4 - 4, 38, 58);
    const s = clamp(satBase + (i % 2) * 5, 20, 42);
    out.push(hslToHex(h, s, l));
  }
  return out;
}

/** Soft wash of a class color for sheet row backgrounds. */
export function faintClassTint(hex: string, alpha = 0.14): string {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "transparent";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** @deprecated Prefer classPaletteForTheme — kept for any stray callers. */
export function classColorsForTheme(themeId: ThemeId) {
  return classPaletteForTheme({ id: themeId, custom: DEFAULT_THEME_CUSTOM }, 10).map(
    (hex, i) => ({ hex, label: `Color ${i + 1}` }),
  );
}

export function nextUnusedClassColor(
  theme: UiThemeSettings,
  usedHexes: string[],
  minSlots = 8,
): string {
  const used = new Set(usedHexes.map((h) => h.toLowerCase()));
  const palette = classPaletteForTheme(
    theme,
    Math.max(minSlots, usedHexes.length + 1),
  );
  return (
    palette.find((hex) => !used.has(hex.toLowerCase())) ||
    palette[usedHexes.length % palette.length]!
  );
}
