"use client";

import { useEffect, useState } from "react";

type Bootstrap = {
  provider: string;
  settings: {
    timezone: string;
    morningBriefingTime: string;
    cronControl: { mode: string; windowStart: string; windowEnd: string; liveUntil: string | null };
  };
  lists: Record<string, number>;
  reminderCount: number;
};

export default function AdminHome() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [syncMsg, setSyncMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/bootstrap");
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function syncInbox() {
    setSyncMsg("Syncing…");
    const res = await fetch("/api/sms/sync", { method: "POST" });
    const json = await res.json();
    setSyncMsg(
      json.skipped
        ? `Skipped: ${json.reason}`
        : `Done — ${json.replies ?? 0} reply(ies)`,
    );
    load();
  }

  if (!data) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const cc = data.settings.cronControl;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="display text-2xl">Status</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--muted)]">Storage</dt>
            <dd className="font-medium">{data.provider}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Timezone</dt>
            <dd className="font-medium">{data.settings.timezone}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Cron mode</dt>
            <dd className="font-medium">
              {cc.mode} ({cc.windowStart}–{cc.windowEnd})
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Morning briefing</dt>
            <dd className="font-medium">{data.settings.morningBriefingTime}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Open list items</dt>
            <dd className="font-medium">
              {Object.entries(data.lists)
                .map(([k, v]) => `.${k}: ${v}`)
                .join(" · ") || "none"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Active reminders</dt>
            <dd className="font-medium">{data.reminderCount}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={syncInbox}
            className="rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-medium text-white"
          >
            Sync inbox now
          </button>
          {syncMsg && <span className="text-sm text-[var(--muted)]">{syncMsg}</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="display text-2xl">Text shortcuts</h2>
        <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
          <li>
            <code className="text-teal-900">.todo milk</code> — add ·{" "}
            <code className="text-teal-900">.todo</code> — show list
          </li>
          <li>
            <code className="text-teal-900">done 2</code> /{" "}
            <code className="text-teal-900">-milk</code> — check off
          </li>
          <li>
            <code className="text-teal-900">remind me to…</code> ·{" "}
            <code className="text-teal-900">quote</code> ·{" "}
            <code className="text-teal-900">mlem</code> ·{" "}
            <code className="text-teal-900">timezone America/Chicago</code>
          </li>
        </ul>
      </section>
    </div>
  );
}
