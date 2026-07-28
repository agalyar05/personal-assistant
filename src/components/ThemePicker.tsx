"use client";

import { useEffect, useMemo, useState } from "react";
import type { ThemeColors, ThemeId, UiThemeSettings } from "@/lib/types";
import { DEFAULT_THEME_CUSTOM } from "@/lib/types";
import { THEME_PRESETS, resolveThemeColors, themeToCssVars } from "@/lib/themes";

export function useUiTheme() {
  const [theme, setTheme] = useState<UiThemeSettings>({
    id: "harbor",
    custom: { ...DEFAULT_THEME_CUSTOM },
  });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.settings?.uiTheme) setTheme(j.settings.uiTheme);
      })
      .catch(() => undefined);
  }, []);

  const colors = useMemo(() => resolveThemeColors(theme), [theme]);

  useEffect(() => {
    const vars = themeToCssVars(colors);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
  }, [colors]);

  async function saveTheme(next: UiThemeSettings) {
    setTheme(next);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiTheme: next }),
    });
  }

  return { theme, colors, saveTheme };
}

export function ThemePicker({
  theme,
  onChange,
}: {
  theme: UiThemeSettings;
  onChange: (t: UiThemeSettings) => void;
}) {
  const ids = Object.keys(THEME_PRESETS) as Exclude<ThemeId, "custom">[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ ...theme, id })}
            className={`rounded-full px-3 py-1.5 text-sm ${
              theme.id === id
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-[var(--card)]"
            }`}
          >
            {THEME_PRESETS[id].label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...theme, id: "custom" })}
          className={`rounded-full px-3 py-1.5 text-sm ${
            theme.id === "custom"
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--line)] bg-[var(--card)]"
          }`}
        >
          Custom
        </button>
      </div>
      {theme.id === "custom" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["bg", "Background"],
              ["ink", "Text"],
              ["accent", "Accent"],
              ["card", "Card"],
              ["muted", "Muted"],
              ["accentSoft", "Accent soft"],
              ["line", "Line"],
            ] as [keyof ThemeColors, string][]
          ).map(([key, label]) => (
            <label key={key} className="text-xs text-[var(--muted)]">
              {label}
              <input
                type="color"
                className="mt-1 h-9 w-full cursor-pointer rounded border border-[var(--line)] bg-white"
                value={theme.custom[key]}
                onChange={(e) =>
                  onChange({
                    ...theme,
                    custom: { ...theme.custom, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
