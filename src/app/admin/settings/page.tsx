"use client";

import { useEffect, useState } from "react";

type Settings = {
  timezone: string;
  weatherCity: string;
  morningBriefingTime: string;
  weeklyBriefingDay: string;
  weeklyBriefingTime: string;
  cronControl: {
    mode: "off" | "always" | "window";
    timezone: string;
    windowStart: string;
    windowEnd: string;
    daysOfWeek: number[];
    liveUntil: string | null;
  };
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState("");

  async function load() {
    const res = await fetch("/api/settings");
    const json = await res.json();
    setSettings(json.settings);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(patch: Record<string, unknown>) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    setSettings(json.settings);
    setSaved("Saved");
    setTimeout(() => setSaved(""), 2000);
  }

  if (!settings) return <p className="text-[var(--muted)]">Loading…</p>;

  const cc = settings.cronControl;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">Timezone & briefing</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Timezone
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={settings.timezone}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Weather city
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={settings.weatherCity}
              onChange={(e) =>
                setSettings({ ...settings, weatherCity: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Morning briefing (HH:MM)
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={settings.morningBriefingTime}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  morningBriefingTime: e.target.value,
                })
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-4 rounded-xl bg-teal-800 px-4 py-2 text-sm text-white"
          onClick={() =>
            save({
              timezone: settings.timezone,
              weatherCity: settings.weatherCity,
              morningBriefingTime: settings.morningBriefingTime,
              cronControl: { ...cc, timezone: settings.timezone },
            })
          }
        >
          Save
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">Cron control</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Keeps Vercel Hobby cheap — most ticks outside the window are instant
          no-ops.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["off", "always", "window"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                setSettings({
                  ...settings,
                  cronControl: { ...cc, mode },
                })
              }
              className={`rounded-full px-3 py-1.5 text-sm ${
                cc.mode === mode
                  ? "bg-teal-800 text-white"
                  : "border border-[var(--line)] bg-white"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Window start
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={cc.windowStart}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  cronControl: { ...cc, windowStart: e.target.value },
                })
              }
            />
          </label>
          <label className="text-sm">
            Window end
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={cc.windowEnd}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  cronControl: { ...cc, windowEnd: e.target.value },
                })
              }
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl bg-teal-800 px-4 py-2 text-sm text-white"
            onClick={() => save({ cronControl: cc })}
          >
            Save cron
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
            onClick={() => save({ liveHours: 2 })}
          >
            Go live 2h
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
            onClick={() => save({ endLive: true })}
          >
            End live
          </button>
        </div>
        {cc.liveUntil && (
          <p className="mt-3 text-sm text-teal-900">
            Live until {new Date(cc.liveUntil).toLocaleString()}
          </p>
        )}
        {saved && <p className="mt-2 text-sm text-[var(--muted)]">{saved}</p>}
      </div>
    </section>
  );
}
