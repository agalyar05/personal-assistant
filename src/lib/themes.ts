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

/** Theme-tuned hue “homes” — palette still spans the wheel for distinguishability. */
const THEME_HUE_BIAS: Record<ThemeId, number> = {
  harbor: 175,
  meadow: 95,
  sunset: 22,
  slate: 215,
  custom: 175,
};

/**
 * Build `count` chip colors that fit the active theme and stay visually distinct.
 * Spaced around the hue wheel from the theme accent, with S/L locked to readable chip range.
 */
export function classPaletteForTheme(
  theme: UiThemeSettings,
  count: number,
): string[] {
  const n = Math.max(1, Math.floor(count));
  const resolved = resolveThemeColors(theme);
  const accent = hexToHsl(resolved.accent);
  const bias =
    theme.id === "custom"
      ? accent.h || THEME_HUE_BIAS.custom
      : THEME_HUE_BIAS[theme.id] ?? accent.h;
  const sat = clamp(accent.s || 55, 48, 72);
  const lit = clamp(accent.l || 38, 30, 44);

  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    // Even spacing + slight offset so index 0 lands near theme accent.
    const h = (bias + (i * 360) / n) % 360;
    // Alternate lightness a touch so adjacent hues read more different.
    const l = clamp(lit + (i % 2 === 0 ? -2 : 3), 28, 46);
    const s = clamp(sat + (i % 3) * 4 - 4, 46, 78);
    out.push(hslToHex(h, s, l));
  }
  return out;
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
