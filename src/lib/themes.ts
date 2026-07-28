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

/** Distinct class/chip colors tuned to each UI theme vibe. */
export const CLASS_COLOR_SUGGESTIONS: Record<
  ThemeId,
  { hex: string; label: string }[]
> = {
  harbor: [
    { hex: "#0f766e", label: "Teal" },
    { hex: "#0369a1", label: "Ocean" },
    { hex: "#4f46e5", label: "Indigo" },
    { hex: "#7c3aed", label: "Violet" },
    { hex: "#be185d", label: "Rose" },
    { hex: "#c2410c", label: "Clay" },
    { hex: "#a16207", label: "Amber" },
    { hex: "#15803d", label: "Forest" },
    { hex: "#0e7490", label: "Cyan" },
    { hex: "#334155", label: "Slate" },
  ],
  meadow: [
    { hex: "#4d7c0f", label: "Leaf" },
    { hex: "#15803d", label: "Moss" },
    { hex: "#0f766e", label: "Pine" },
    { hex: "#a16207", label: "Honey" },
    { hex: "#b45309", label: "Rust" },
    { hex: "#9f1239", label: "Berry" },
    { hex: "#6d28d9", label: "Plum" },
    { hex: "#1d4ed8", label: "Bluebell" },
    { hex: "#0e7490", label: "Stream" },
    { hex: "#3f6212", label: "Olive" },
  ],
  sunset: [
    { hex: "#c2410c", label: "Ember" },
    { hex: "#ea580c", label: "Flame" },
    { hex: "#b45309", label: "Copper" },
    { hex: "#be123c", label: "Crimson" },
    { hex: "#9f1239", label: "Wine" },
    { hex: "#7e22ce", label: "Fig" },
    { hex: "#1d4ed8", label: "Dusk" },
    { hex: "#0f766e", label: "Lagoon" },
    { hex: "#a16207", label: "Gold" },
    { hex: "#44403c", label: "Char" },
  ],
  slate: [
    { hex: "#334155", label: "Steel" },
    { hex: "#0f766e", label: "Teal" },
    { hex: "#1d4ed8", label: "Cobalt" },
    { hex: "#6d28d9", label: "Iris" },
    { hex: "#be185d", label: "Magenta" },
    { hex: "#c2410c", label: "Rust" },
    { hex: "#a16207", label: "Brass" },
    { hex: "#15803d", label: "Green" },
    { hex: "#0e7490", label: "Aqua" },
    { hex: "#64748b", label: "Fog" },
  ],
  custom: [
    { hex: "#0f766e", label: "Teal" },
    { hex: "#1d4ed8", label: "Blue" },
    { hex: "#7c3aed", label: "Purple" },
    { hex: "#be185d", label: "Pink" },
    { hex: "#c2410c", label: "Orange" },
    { hex: "#a16207", label: "Gold" },
    { hex: "#15803d", label: "Green" },
    { hex: "#0e7490", label: "Cyan" },
    { hex: "#334155", label: "Slate" },
    { hex: "#9f1239", label: "Red" },
  ],
};

export function classColorsForTheme(themeId: ThemeId) {
  return CLASS_COLOR_SUGGESTIONS[themeId] || CLASS_COLOR_SUGGESTIONS.harbor;
}
