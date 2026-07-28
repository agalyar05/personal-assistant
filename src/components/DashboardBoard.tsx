"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultDashboardLayout,
  newWidget,
  normalizeDashboardLayout,
  spanClass,
  WIDGET_CATALOG,
} from "@/lib/dashboard";
import type {
  AppSettings,
  Assignment,
  Course,
  DashboardLayout,
  DashboardWidget,
  DashboardWidgetType,
  ListItem,
} from "@/lib/types";

type Bootstrap = {
  provider: string;
  settings: AppSettings;
  lists: Record<string, number>;
  reminderCount: number;
  courses: Course[];
  dueSoon: Assignment[];
  todos: ListItem[];
  assignments: Assignment[];
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDue(iso: string | null): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function DashboardBoard() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [layout, setLayout] = useState<DashboardLayout>(defaultDashboardLayout());
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saveState, setSaveState] = useState("");
  const saveTimer = useRef<number | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bootstrap");
    if (!res.ok) return;
    const json = (await res.json()) as Bootstrap;
    setData(json);
    setLayout(normalizeDashboardLayout(json.settings?.dashboardLayout));
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [load]);

  async function saveNow(next: DashboardLayout) {
    setSaveState("Saving…");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardLayout: next }),
    });
    setSaveState(res.ok ? "Saved" : "Save failed");
    window.setTimeout(() => setSaveState(""), 1500);
  }

  function persist(next: DashboardLayout, immediate = true) {
    setLayout(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (immediate) {
      void saveNow(next);
      return;
    }
    saveTimer.current = window.setTimeout(() => void saveNow(next), 450);
  }

  function updateWidget(
    id: string,
    patch: Partial<DashboardWidget>,
    immediate = true,
  ) {
    const widgets = layoutRef.current.widgets.map((w) =>
      w.id === id ? { ...w, ...patch } : w,
    );
    persist({ widgets }, immediate);
  }

  function removeWidget(id: string) {
    persist({
      widgets: layoutRef.current.widgets.filter((w) => w.id !== id),
    });
  }

  function addWidget(type: DashboardWidgetType) {
    persist({
      widgets: [...layoutRef.current.widgets, newWidget(type)],
    });
    setAddOpen(false);
  }

  function resetLayout() {
    persist(defaultDashboardLayout());
  }

  function onDropOn(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = [...layoutRef.current.widgets];
    const from = next.findIndex((w) => w.id === dragId);
    const to = next.findIndex((w) => w.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    persist({ widgets: next });
    setDragId(null);
    setOverId(null);
  }

  async function syncInbox() {
    setSyncMsg("Syncing…");
    const res = await fetch("/api/sms/sync", { method: "POST" });
    const json = await res.json();
    setSyncMsg(
      json.skipped
        ? `Skipped: ${json.reason}`
        : `Done — ${json.replies ?? 0} reply(ies)`,
    );
    await load();
  }

  if (!data) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const courseMap = new Map(data.courses.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Home
          </p>
          <h2 className="display text-2xl">{greeting()}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saveState && (
            <span className="text-xs text-[var(--muted)]">{saveState}</span>
          )}
          {editing && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddOpen((o) => !o)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
                >
                  + Widget
                </button>
                {addOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[var(--line)] bg-[var(--card)] p-2 shadow-lg">
                    {WIDGET_CATALOG.map((c) => (
                      <button
                        key={c.type}
                        type="button"
                        onClick={() => addWidget(c.type)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]"
                      >
                        <span className="font-medium">{c.label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {c.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={resetLayout}
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
              >
                Reset
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setEditing((e) => !e);
              setAddOpen(false);
            }}
            className={`rounded-xl px-3 py-1.5 text-sm ${
              editing
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-white"
            }`}
          >
            {editing ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {editing && (
        <p className="text-sm text-[var(--muted)]">
          Drag widgets to rearrange · change size · edit text and images · add
          or remove tiles
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {layout.widgets.map((w) => (
          <div
            key={w.id}
            draggable={editing}
            onDragStart={() => setDragId(w.id)}
            onDragOver={(e) => {
              if (!editing) return;
              e.preventDefault();
              setOverId(w.id);
            }}
            onDragLeave={() => setOverId((id) => (id === w.id ? null : id))}
            onDrop={(e) => {
              e.preventDefault();
              onDropOn(w.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={`${spanClass(w.span)} ${
              overId === w.id && dragId !== w.id
                ? "ring-2 ring-[var(--accent)]"
                : ""
            } ${dragId === w.id ? "opacity-50" : ""} ${
              editing ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          >
            <WidgetShell
              widget={w}
              editing={editing}
              onUpdate={(patch) => updateWidget(w.id, patch)}
              onRemove={() => removeWidget(w.id)}
            >
              <WidgetBody
                widget={w}
                data={data}
                courseMap={courseMap}
                editing={editing}
                syncMsg={syncMsg}
                onSync={() => void syncInbox()}
                onUpdate={(patch, immediate) =>
                  updateWidget(w.id, patch, immediate)
                }
              />
            </WidgetShell>
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetShell({
  widget,
  editing,
  onUpdate,
  onRemove,
  children,
}: {
  widget: DashboardWidget;
  editing: boolean;
  onUpdate: (patch: Partial<DashboardWidget>) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className="h-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm"
      style={
        widget.accent
          ? { borderTopColor: widget.accent, borderTopWidth: 3 }
          : undefined
      }
    >
      {editing && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-xs">
          <span className="text-[var(--muted)]">Size</span>
          {([1, 2, 3] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onUpdate({ span: s })}
              className={`rounded-md px-2 py-0.5 ${
                widget.span === s
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white"
              }`}
            >
              {s === 1 ? "S" : s === 2 ? "M" : "L"}
            </button>
          ))}
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto text-red-700"
          >
            Remove
          </button>
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function WidgetBody({
  widget,
  data,
  courseMap,
  editing,
  syncMsg,
  onSync,
  onUpdate,
}: {
  widget: DashboardWidget;
  data: Bootstrap;
  courseMap: Map<string, Course>;
  editing: boolean;
  syncMsg: string;
  onSync: () => void;
  onUpdate: (patch: Partial<DashboardWidget>, immediate?: boolean) => void;
}) {
  const cc = data.settings.cronControl;

  switch (widget.type) {
    case "welcome":
      return (
        <div>
          {editing ? (
            <>
              <input
                className="display w-full bg-transparent text-2xl outline-none"
                value={widget.title || ""}
                onChange={(e) => onUpdate({ title: e.target.value }, false)}
                placeholder="Title"
              />
              <textarea
                className="mt-2 w-full resize-y bg-transparent text-sm text-[var(--muted)] outline-none"
                rows={3}
                value={widget.text || ""}
                onChange={(e) => onUpdate({ text: e.target.value }, false)}
                placeholder="Subtitle"
              />
            </>
          ) : (
            <>
              <h3 className="display text-2xl">
                {widget.title || "Welcome back"}
              </h3>
              {widget.text && (
                <p className="mt-2 text-sm text-[var(--muted)]">{widget.text}</p>
              )}
            </>
          )}
        </div>
      );

    case "status":
      return (
        <div>
          <h3 className="display text-xl">Status</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Storage</dt>
              <dd className="font-medium">{data.provider}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Timezone</dt>
              <dd className="font-medium">{data.settings.timezone}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Cron</dt>
              <dd className="font-medium">
                {cc.mode} ({cc.windowStart}–{cc.windowEnd})
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Briefing</dt>
              <dd className="font-medium">{data.settings.morningBriefingTime}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Lists</dt>
              <dd className="font-medium">
                {Object.entries(data.lists)
                  .map(([k, v]) => `.${k}: ${v}`)
                  .join(" · ") || "none"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Reminders</dt>
              <dd className="font-medium">{data.reminderCount}</dd>
            </div>
          </dl>
        </div>
      );

    case "sync":
      return (
        <div className="flex h-full flex-col justify-between gap-4">
          <div>
            <h3 className="display text-xl">Inbox</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Pull new SMS and reply if needed.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={onSync}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
            >
              Sync inbox now
            </button>
            {syncMsg && (
              <p className="mt-2 text-sm text-[var(--muted)]">{syncMsg}</p>
            )}
          </div>
        </div>
      );

    case "due_soon":
      return (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="display text-xl">Due soon</h3>
            <Link
              href="/admin/assignments"
              className="text-xs text-[var(--accent)] underline"
            >
              All
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {data.dueSoon.map((a) => {
              const c = a.courseId ? courseMap.get(a.courseId) : null;
              return (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-2 border-b border-[var(--line)] pb-2 last:border-0"
                >
                  <span className="min-w-0">
                    {c && (
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: c.color }}
                      />
                    )}
                    {a.title}
                  </span>
                  <span className="shrink-0 text-[var(--muted)]">
                    {formatDue(a.dueAt)}
                  </span>
                </li>
              );
            })}
            {!data.dueSoon.length && (
              <li className="text-[var(--muted)]">Nothing due yet.</li>
            )}
          </ul>
        </div>
      );

    case "todo":
      return (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="display text-xl">.todo</h3>
            <Link
              href="/admin/todo"
              className="text-xs text-[var(--accent)] underline"
            >
              Board
            </Link>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {data.todos.map((t) => (
              <li key={t.id} className="flex gap-2">
                <span className="text-[var(--muted)]">○</span>
                <span>{t.text}</span>
              </li>
            ))}
            {!data.todos.length && (
              <li className="text-[var(--muted)]">All clear.</li>
            )}
          </ul>
        </div>
      );

    case "progress": {
      const cards = data.courses.map((c) => {
        const mine = data.assignments.filter((a) => a.courseId === c.id);
        const countable = mine.filter((a) => a.status !== "n_a");
        const done = countable.filter(
          (a) => a.status === "complete" || a.status === "submitted",
        ).length;
        const pct = countable.length
          ? Math.round((done / countable.length) * 100)
          : 0;
        return { c, done, total: countable.length, pct };
      });
      return (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="display text-xl">Progress</h3>
            <Link
              href="/admin/assignments"
              className="text-xs text-[var(--accent)] underline"
            >
              Details
            </Link>
          </div>
          <div className="mt-3 space-y-3">
            {cards.map(({ c, done, total, pct }) => (
              <div key={c.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.code || c.name}
                  </span>
                  <span className="text-[var(--muted)]">
                    {done}/{total} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: c.color }}
                  />
                </div>
              </div>
            ))}
            {!cards.length && (
              <p className="text-sm text-[var(--muted)]">
                Add classes in Groups.
              </p>
            )}
          </div>
        </div>
      );
    }

    case "notes":
      return (
        <div>
          {editing ? (
            <>
              <input
                className="mb-2 w-full bg-transparent text-sm font-medium outline-none"
                value={widget.title || ""}
                onChange={(e) => onUpdate({ title: e.target.value }, false)}
                placeholder="Note title"
              />
              <textarea
                className="w-full resize-y bg-transparent text-sm outline-none"
                rows={6}
                value={widget.text || ""}
                onChange={(e) => onUpdate({ text: e.target.value }, false)}
                placeholder="Write…"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                Accent
                <input
                  type="color"
                  value={widget.accent || "#0f766e"}
                  onChange={(e) => onUpdate({ accent: e.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              {widget.title && (
                <h3 className="display text-xl">{widget.title}</h3>
              )}
              <textarea
                className="mt-2 w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
                rows={5}
                value={widget.text || ""}
                onChange={(e) => onUpdate({ text: e.target.value }, false)}
                placeholder="Write something…"
              />
            </>
          )}
        </div>
      );

    case "image":
      return (
        <div>
          {editing && (
            <div className="mb-3 space-y-2">
              <input
                className="w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
                value={widget.title || ""}
                onChange={(e) => onUpdate({ title: e.target.value }, false)}
                placeholder="Caption"
              />
              <input
                className="w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
                value={widget.imageUrl || ""}
                onChange={(e) => onUpdate({ imageUrl: e.target.value }, false)}
                placeholder="Image URL"
              />
              <label className="block text-xs text-[var(--muted)]">
                Or upload
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1_200_000) {
                      alert("Keep images under ~1.2MB for settings storage.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      onUpdate({ imageUrl: String(reader.result || "") });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          )}
          {widget.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={widget.imageUrl}
              alt={widget.title || "Dashboard image"}
              className="max-h-64 w-full rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[var(--line)] text-sm text-[var(--muted)]">
              {editing ? "Add a URL or upload" : "No image yet"}
            </div>
          )}
          {!editing && widget.title && (
            <p className="mt-2 text-sm text-[var(--muted)]">{widget.title}</p>
          )}
        </div>
      );

    case "shortcuts":
      return (
        <div>
          <h3 className="display text-xl">Text shortcuts</h3>
          <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
            <li>
              <code className="text-[var(--ink)]">.todo milk</code> — add ·{" "}
              <code className="text-[var(--ink)]">.todo</code> — show list
            </li>
            <li>
              <code className="text-[var(--ink)]">done 2</code> /{" "}
              <code className="text-[var(--ink)]">-milk</code> — check off
            </li>
            <li>
              <code className="text-[var(--ink)]">remind me to…</code> ·{" "}
              <code className="text-[var(--ink)]">quote</code> ·{" "}
              <code className="text-[var(--ink)]">mlem</code> ·{" "}
              <code className="text-[var(--ink)]">timezone America/Chicago</code>
            </li>
            <li>
              <code className="text-[var(--ink)]">due today</code> ·{" "}
              <code className="text-[var(--ink)]">due tomorrow</code>
            </li>
          </ul>
        </div>
      );

    default:
      return null;
  }
}
