"use client";

import { useEffect, useState } from "react";

type Reminder = {
  id: string;
  message: string;
  remindAt: string | null;
  frequency: string;
  fireTime: string | null;
};

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [message, setMessage] = useState("");
  const [remindAt, setRemindAt] = useState("");

  async function load() {
    const res = await fetch("/api/reminders");
    const json = await res.json();
    setReminders(json.reminders || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        remindAt: remindAt || null,
        frequency: "once",
      }),
    });
    setMessage("");
    setRemindAt("");
    load();
  }

  async function cancel(q: string) {
    await fetch(`/api/reminders?q=${encodeURIComponent(q)}`, {
      method: "DELETE",
    });
    load();
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
      <h2 className="display text-2xl">Reminders</h2>
      <ul className="mt-4 space-y-2">
        {reminders.length === 0 && (
          <li className="text-sm text-[var(--muted)]">No active reminders.</li>
        )}
        {reminders.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm"
          >
            <span>
              {r.message}
              <span className="ml-2 text-[var(--muted)]">
                ({r.frequency === "once" ? r.remindAt || "one-time" : `${r.frequency} ${r.fireTime}`})
              </span>
            </span>
            <button
              type="button"
              onClick={() => cancel(r.message)}
              className="text-xs text-red-700"
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-3">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Reminder message"
          className="w-full rounded-xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm"
        />
        <input
          value={remindAt}
          onChange={(e) => setRemindAt(e.target.value)}
          placeholder="Local datetime e.g. 2026-07-28T15:00:00"
          className="w-full rounded-xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-medium text-white"
        >
          Add reminder
        </button>
      </div>
    </section>
  );
}
