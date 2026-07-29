"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  daysBeforeDeadline,
  normalizeApplicationUrl,
  parseApplicationPaste,
  remindAtFromDateAndTime,
  sortApplications,
} from "@/lib/applications";
import {
  APPLICATION_KINDS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
} from "@/lib/application-meta";
import type {
  Application,
  ApplicationKind,
  ApplicationStatus,
} from "@/lib/types";

type View = "master" | "board";

const emptyForm = {
  title: "",
  kind: "scholarship" as ApplicationKind,
  status: "idea" as ApplicationStatus,
  url: "",
  description: "",
  deadline: "",
  remindDate: "",
  remindTime: "09:00",
  notes: "",
  remindPreset: "none" as "none" | "7" | "1" | "custom",
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [view, setView] = useState<View>("master");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<ApplicationStatus | "open" | "all">(
    "all",
  );
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pasteBlock, setPasteBlock] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/applications");
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error || "Could not load applications");
      return;
    }
    setApps(sortApplications(json.applications || []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closed = new Set<ApplicationStatus>([
    "accepted",
    "rejected",
    "withdrawn",
  ]);

  const visible = useMemo(() => {
    if (filter === "all") return apps;
    if (filter === "open") return apps.filter((a) => !closed.has(a.status));
    return apps.filter((a) => a.status === filter);
  }, [apps, filter]);

  function computeRemindAt(f: typeof form): string | null {
    if (f.remindPreset === "none") return null;
    if (f.remindPreset === "7" && f.deadline) {
      return daysBeforeDeadline(f.deadline, 7, f.remindTime);
    }
    if (f.remindPreset === "1" && f.deadline) {
      return daysBeforeDeadline(f.deadline, 1, f.remindTime);
    }
    if (f.remindDate) {
      return remindAtFromDateAndTime(f.remindDate, f.remindTime);
    }
    return null;
  }

  function applyPaste() {
    const parsed = parseApplicationPaste(pasteBlock);
    setForm((prev) => ({
      ...prev,
      title: parsed.title || prev.title,
      kind: (parsed.kind || prev.kind) as ApplicationKind,
      url: parsed.url || prev.url,
      description: parsed.description || prev.description,
      deadline: parsed.deadline || prev.deadline,
      notes: parsed.notes
        ? prev.notes
          ? `${prev.notes}\n${parsed.notes}`
          : parsed.notes
        : prev.notes,
    }));
    const filled = [
      parsed.title && "title",
      parsed.kind && "type",
      parsed.url && "link",
      parsed.deadline && "deadline",
      parsed.description && "description",
      parsed.notes && "notes",
    ].filter(Boolean);
    setMsg(
      filled.length
        ? `Filled from paste: ${filled.join(", ")} — review and save`
        : "Nothing recognized in that paste — fields left as-is",
    );
  }

  async function save() {
    if (!form.title.trim()) {
      setMsg("Title required");
      return;
    }
    const remindAt = computeRemindAt(form);
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId || undefined,
        title: form.title,
        kind: form.kind,
        status: form.status,
        url: form.url,
        description: form.description,
        deadline: form.deadline || null,
        remindAt,
        notes: form.notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json.error || "Save failed — check that the applications table exists in Supabase");
      return;
    }
    if (Array.isArray(json.applications)) {
      setApps(sortApplications(json.applications));
    } else {
      await load();
    }
    setFilter("all");
    setView("master");
    setMsg(
      remindAt
        ? `Saved — SMS reminder set for ${remindAt.replace("T", " ")}`
        : editingId
          ? "Updated"
          : "Added to master list",
    );
    setForm(emptyForm);
    setPasteBlock("");
    setEditingId(null);
  }

  function startEdit(a: Application) {
    setEditingId(a.id);
    setForm({
      title: a.title,
      kind: a.kind,
      status: a.status,
      url: a.url,
      description: a.description,
      deadline: a.deadline || "",
      remindDate: a.remindAt ? a.remindAt.slice(0, 10) : "",
      remindTime: a.remindAt?.includes("T")
        ? a.remindAt.slice(11, 16)
        : "09:00",
      notes: a.notes,
      remindPreset: a.remindAt ? "custom" : "none",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function patchStatus(id: string, status: ApplicationStatus) {
    const a = apps.find((x) => x.id === id);
    if (!a) return;
    await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: a.title, status }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this application and its SMS reminder?")) return;
    await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="display text-xl leading-tight">Applications</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Master list for scholarships, jobs, programs — with SMS reminders
              (even a year out).
            </p>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ["master", "Master list"],
                ["board", "Board"],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                  view === id
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {msg && <p className="mt-2 text-sm text-[var(--accent)]">{msg}</p>}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          {editingId ? "Edit application" : "Add to master list"}
        </h3>
        {!editingId && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-[var(--muted)]">
              Paste a scholarship / job blurb — we fill what we can
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
                placeholder="Paste email, listing, or notes here…"
                value={pasteBlock}
                onChange={(e) => setPasteBlock(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={applyPaste}
              disabled={!pasteBlock.trim()}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Fill fields from paste
            </button>
          </div>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm sm:col-span-2"
            placeholder="Name (e.g. Gates Scholarship)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <select
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={form.kind}
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as ApplicationKind })
            }
          >
            {APPLICATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as ApplicationStatus,
              })
            }
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm sm:col-span-2"
            placeholder="Link"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
          <textarea
            className="min-h-20 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm sm:col-span-2"
            placeholder="Description / requirements"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label className="text-xs text-[var(--muted)]">
            Deadline
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            SMS reminder
            <select
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
              value={form.remindPreset}
              onChange={(e) =>
                setForm({
                  ...form,
                  remindPreset: e.target.value as typeof form.remindPreset,
                })
              }
            >
              <option value="none">No reminder</option>
              <option value="7">7 days before deadline</option>
              <option value="1">1 day before deadline</option>
              <option value="custom">Custom date (any time — even a year+)</option>
            </select>
          </label>
          {form.remindPreset === "custom" && (
            <>
              <label className="text-xs text-[var(--muted)]">
                Remind on
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
                  value={form.remindDate}
                  onChange={(e) =>
                    setForm({ ...form, remindDate: e.target.value })
                  }
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Time
                <input
                  type="time"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
                  value={form.remindTime}
                  onChange={(e) =>
                    setForm({ ...form, remindTime: e.target.value })
                  }
                />
              </label>
            </>
          )}
          {(form.remindPreset === "7" || form.remindPreset === "1") && (
            <label className="text-xs text-[var(--muted)]">
              Reminder time
              <input
                type="time"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
                value={form.remindTime}
                onChange={(e) =>
                  setForm({ ...form, remindTime: e.target.value })
                }
              />
            </label>
          )}
          <textarea
            className="min-h-16 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm sm:col-span-2"
            placeholder="Private notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            {editingId ? "Save changes" : "Add application"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm"
            >
              Cancel edit
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["open", "Open"],
            ["all", "All"],
            ...APPLICATION_STATUSES.map(
              (s) => [s, APPLICATION_STATUS_LABELS[s]] as const,
            ),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id as typeof filter)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              filter === id
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-[var(--card)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "master" && (
        <div className="space-y-2">
          {visible.map((a) => (
            <article
              key={a.id}
              className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent)]">
                      {a.kind}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {APPLICATION_STATUS_LABELS[a.status]}
                    </span>
                  </div>
                  <h3 className="mt-1 font-medium">
                    {a.url ? (
                      <a
                        href={normalizeApplicationUrl(a.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        {a.title}
                      </a>
                    ) : (
                      a.title
                    )}
                  </h3>
                  {a.description && (
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {a.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                    {a.deadline && <span>Deadline {a.deadline}</span>}
                    {a.remindAt && (
                      <span>
                        🔔 SMS {a.remindAt.replace("T", " ").slice(0, 16)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs"
                    value={a.status}
                    onChange={(e) =>
                      void patchStatus(
                        a.id,
                        e.target.value as ApplicationStatus,
                      )
                    }
                  >
                    {APPLICATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {APPLICATION_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-xs text-[var(--accent)]"
                    onClick={() => startEdit(a)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-700"
                    onClick={() => void remove(a.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!visible.length && (
            <p className="text-sm text-[var(--muted)]">
              No applications yet — add your first above.
            </p>
          )}
        </div>
      )}

      {view === "board" && (
        <div
          className="grid w-full gap-2 overflow-x-auto"
          style={{
            gridTemplateColumns: `repeat(${APPLICATION_STATUSES.length}, minmax(min(100%, 9rem), 1fr))`,
          }}
        >
          {APPLICATION_STATUSES.map((status) => {
            const items = apps.filter((a) => a.status === status);
            return (
              <div
                key={status}
                className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-2"
              >
                <div className="mb-2 text-xs font-medium">
                  {APPLICATION_STATUS_LABELS[status]}{" "}
                  <span className="text-[var(--muted)]">({items.length})</span>
                </div>
                <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
                  {items.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => startEdit(a)}
                      className="w-full rounded-lg border border-[var(--line)] bg-white/90 px-2 py-2 text-left text-xs hover:border-[var(--accent)]"
                    >
                      <div className="font-medium leading-snug">{a.title}</div>
                      {a.deadline && (
                        <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                          {a.deadline}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
