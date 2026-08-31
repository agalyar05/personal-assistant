"use client";

import { useEffect, useState } from "react";
import type { UiThemeSettings } from "@/lib/types";
import { DEFAULT_THEME_CUSTOM } from "@/lib/types";
import { ThemePicker, useUiTheme } from "@/components/ThemePicker";

type Settings = {
  timezone: string;
  weatherCity: string;
  morningBriefingTime: string;
  weeklyBriefingDay: string;
  weeklyBriefingTime: string;
  taskHorizonDays: number;
  dueSoonBoldDays: number;
  uiTheme: UiThemeSettings;
  cronControl: {
    mode: "off" | "always" | "window";
    timezone: string;
    windowStart: string;
    windowEnd: string;
    daysOfWeek: number[];
    liveUntil: string | null;
  };
  masterlistBackupDay: string;
  masterlistBackupTime: string;
  lastMasterlistBackup: string | null;
  masterlistBackupSheetUrl: string | null;
};

export default function SettingsPage() {
  const { theme, saveTheme } = useUiTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState("");
  const [taskHorizonInput, setTaskHorizonInput] = useState("7");
  const [dueSoonBoldInput, setDueSoonBoldInput] = useState("1");
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");

  async function load() {
    const res = await fetch("/api/settings");
    const json = await res.json();
    const horizon = Number(json.settings?.taskHorizonDays ?? 7);
    const dueSoonBold = Number(json.settings?.dueSoonBoldDays ?? 1);
    setSettings({
      ...json.settings,
      uiTheme: json.settings?.uiTheme || {
        id: "harbor",
        custom: { ...DEFAULT_THEME_CUSTOM },
      },
      weatherCity: json.settings?.weatherCity || "Detroit",
      taskHorizonDays: horizon,
      dueSoonBoldDays: dueSoonBold,
    });
    setTaskHorizonInput(String(horizon));
    setDueSoonBoldInput(String(dueSoonBold));
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
    const horizon = Number(
      json.settings?.taskHorizonDays ?? settings?.taskHorizonDays ?? 7,
    );
    const dueSoonBold = Number(
      json.settings?.dueSoonBoldDays ?? settings?.dueSoonBoldDays ?? 1,
    );
    setSettings({
      ...json.settings,
      uiTheme: json.settings?.uiTheme || theme,
      weatherCity: json.settings?.weatherCity || "Detroit",
      taskHorizonDays: horizon,
      dueSoonBoldDays: dueSoonBold,
    });
    setTaskHorizonInput(String(horizon));
    setDueSoonBoldInput(String(dueSoonBold));
    setSaved("Saved");
    setTimeout(() => setSaved(""), 2000);
  }

  if (!settings) return <p className="text-[var(--muted)]">Loading…</p>;

  const cc = settings.cronControl;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">Color palette</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Theme for the whole dashboard. Class color suggestions in Groups
          follow this vibe.
        </p>
        <div className="mt-4">
          <ThemePicker
            theme={theme}
            onChange={async (next) => {
              await saveTheme(next);
              setSettings({ ...settings, uiTheme: next });
              setSaved("Saved");
              setTimeout(() => setSaved(""), 2000);
            }}
          />
        </div>
      </div>

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
          <label className="text-sm sm:col-span-2">
            Task horizon (days)
            <input
              type="number"
              min={0}
              max={365}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={taskHorizonInput}
              onChange={(e) => {
                const raw = e.target.value;
                setTaskHorizonInput(raw);
                if (raw === "") return;
                const n = Number(raw);
                if (!Number.isNaN(n)) {
                  setSettings({
                    ...settings,
                    taskHorizonDays: Math.max(0, Math.min(365, n)),
                  });
                }
              }}
              onBlur={() => {
                if (taskHorizonInput === "") {
                  setTaskHorizonInput(String(settings.taskHorizonDays));
                }
              }}
            />
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Masterlist sheet / agenda / kanban only show tasks due within this
              many days (plus overdue &amp; undated). Calendar always shows
              everything. Use 0 for all tasks.
            </span>
          </label>
          <label className="text-sm sm:col-span-2">
            Bold tasks due within (days)
            <input
              type="number"
              min={0}
              max={365}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={dueSoonBoldInput}
              onChange={(e) => {
                const raw = e.target.value;
                setDueSoonBoldInput(raw);
                if (raw === "") return;
                const n = Number(raw);
                if (!Number.isNaN(n)) {
                  setSettings({
                    ...settings,
                    dueSoonBoldDays: Math.max(0, Math.min(365, n)),
                  });
                }
              }}
              onBlur={() => {
                if (dueSoonBoldInput === "") {
                  setDueSoonBoldInput(String(settings.dueSoonBoldDays));
                }
              }}
            />
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Masterlist bolds a task if it&apos;s overdue, due today, or due
              within this many days. Use 0 to only bold overdue &amp; due
              today.
            </span>
          </label>
        </div>
        <button
          type="button"
          className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
          onClick={() =>
            save({
              timezone: settings.timezone,
              weatherCity: settings.weatherCity,
              morningBriefingTime: settings.morningBriefingTime,
              taskHorizonDays: settings.taskHorizonDays,
              dueSoonBoldDays: settings.dueSoonBoldDays,
              cronControl: { ...cc, timezone: settings.timezone },
            })
          }
        >
          Save
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">Masterlist backup</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Weekly snapshot of every Masterlist row, written to a Google
          Sheet — a safety net if anything here ever gets lost.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Day
            <select
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={settings.masterlistBackupDay}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  masterlistBackupDay: e.target.value,
                })
              }
            >
              {[
                "sunday",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
              ].map((d) => (
                <option key={d} value={d}>
                  {d[0]!.toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Time (HH:MM)
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
              value={settings.masterlistBackupTime}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  masterlistBackupTime: e.target.value,
                })
              }
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
            onClick={() =>
              save({
                masterlistBackupDay: settings.masterlistBackupDay,
                masterlistBackupTime: settings.masterlistBackupTime,
              })
            }
          >
            Save
          </button>
          <button
            type="button"
            disabled={backingUp}
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
            onClick={async () => {
              setBackingUp(true);
              setBackupMsg("Backing up…");
              try {
                const res = await fetch("/api/masterlist-backup", {
                  method: "POST",
                });
                const json = await res.json();
                if (json.ok) {
                  setBackupMsg("Backed up just now");
                  await load();
                } else {
                  setBackupMsg(`Failed: ${json.error || "unknown error"}`);
                }
              } catch {
                setBackupMsg("Failed to reach the server");
              } finally {
                setBackingUp(false);
              }
            }}
          >
            {backingUp ? "Backing up…" : "Back up now"}
          </button>
          {settings.masterlistBackupSheetUrl && (
            <a
              href={settings.masterlistBackupSheetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[var(--accent)] underline"
            >
              Open backup sheet
            </a>
          )}
        </div>
        {backupMsg && (
          <p className="mt-2 text-sm text-[var(--muted)]">{backupMsg}</p>
        )}
        {settings.lastMasterlistBackup && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Last backup: {settings.lastMasterlistBackup}
          </p>
        )}
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
                  ? "bg-[var(--accent)] text-white"
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
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
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
          <p className="mt-3 text-sm text-[var(--accent)]">
            Live until {new Date(cc.liveUntil).toLocaleString()}
          </p>
        )}
        {saved && <p className="mt-2 text-sm text-[var(--muted)]">{saved}</p>}
      </div>
    </section>
  );
}
