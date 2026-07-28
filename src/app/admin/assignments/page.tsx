"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Assignment, AssignmentStatus, Course } from "@/lib/types";
import {
  ASSIGNMENT_DIFFICULTIES,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_LABELS,
  isClosedAssignmentStatus,
  isSubmittedStyle,
} from "@/lib/types";
import { AssignmentSheet } from "@/components/AssignmentSheet";
import { CelebrationBurst } from "@/components/CelebrationBurst";
import { dueDateParts, formatDueDate } from "@/lib/fill";
import {
  kanbanBoardClass,
  kanbanBoardStyle,
  kanbanColumnBodyClass,
  kanbanColumnClass,
} from "@/lib/kanban-layout";

type View = "sheet" | "calendar" | "kanban" | "agenda" | "progress";
type KanbanBy = "status" | "class" | "difficulty";

const STATUS_LABEL = ASSIGNMENT_STATUS_LABELS;

export default function AssignmentsPage() {
  const [view, setView] = useState<View>("sheet");
  const [kanbanBy, setKanbanBy] = useState<KanbanBy>("status");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [msg, setMsg] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/assignments");
    const json = await res.json();
    setAssignments(
      (json.assignments || []).map((a: Assignment) => ({
        ...a,
        link: a.link || "",
      })),
    );
    setCourses(json.courses || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const courseMap = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );

  async function patchAssignment(patch: Partial<Assignment> & { id: string }) {
    const prev = assignments.find((a) => a.id === patch.id);
    setAssignments((list) =>
      list.map((a) => (a.id === patch.id ? { ...a, ...patch } : a)),
    );
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setMsg("Save failed — reloading");
      await load();
      return;
    }
    if (
      patch.status === "submitted" &&
      prev?.status !== "submitted"
    ) {
      setCelebrate(true);
    }
  }

  async function addBlankRow() {
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New assignment",
        status: "not_started",
        difficulty: "medium",
        assignmentType: "Homework",
        link: "",
        sortOrder: assignments.length + 1,
      }),
    });
    if (!res.ok) {
      setMsg("Could not add row");
      return;
    }
    setMsg("Row added");
    await load();
  }

  async function removeRow(id: string) {
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  async function bulkSave(
    rows: (Partial<Assignment> & { title?: string; id?: string })[],
  ) {
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk", rows }),
    });
    await load();
  }

  const views: [View, string][] = [
    ["sheet", "Sheet"],
    ["agenda", "Agenda"],
    ["calendar", "Calendar"],
    ["kanban", "Kanban"],
    ["progress", "Progress"],
  ];

  return (
    <div className="space-y-4">
      <CelebrationBurst
        open={celebrate}
        onDone={() => setCelebrate(false)}
        label="Submitted! 🎉"
      />
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="display text-xl leading-tight">Assignments</h2>
            <p className="mt-0.5 hidden text-xs text-[var(--muted)] sm:block">
              Classes in{" "}
              <a href="/admin/groups" className="text-[var(--accent)] underline">
                Groups
              </a>
              . Text <code className="text-[var(--ink)]">due today</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {views.map(([id, label]) => (
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

      {view === "sheet" && (
        <AssignmentSheet
          assignments={assignments}
          courses={courses}
          onChangeLocal={(id, patch) =>
            setAssignments((prev) =>
              prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
            )
          }
          onPatch={patchAssignment}
          onAddRow={addBlankRow}
          onDelete={removeRow}
          onBulk={bulkSave}
          onMsg={setMsg}
        />
      )}

      {view === "agenda" && (
        <AgendaView
          assignments={assignments}
          courseMap={courseMap}
          onStatus={(id, status) => void patchAssignment({ id, status })}
        />
      )}

      {view === "calendar" && (
        <CalendarView
          month={month}
          setMonth={setMonth}
          assignments={assignments}
          courseMap={courseMap}
          onMoveDay={(ids, dueAt) => {
            void (async () => {
              await Promise.all(
                ids.map((id) => patchAssignment({ id, dueAt })),
              );
            })();
          }}
        />
      )}

      {view === "progress" && (
        <ProgressView assignments={assignments} courses={courses} />
      )}

      {view === "kanban" && (
        <KanbanView
          assignments={assignments}
          courses={courses}
          kanbanBy={kanbanBy}
          setKanbanBy={setKanbanBy}
          onDropCards={(ids, columnId) => {
            void (async () => {
              const patch =
                kanbanBy === "status"
                  ? { status: columnId as AssignmentStatus }
                  : kanbanBy === "difficulty"
                    ? {
                        difficulty: columnId as Assignment["difficulty"],
                      }
                    : {
                        courseId: columnId === "none" ? null : columnId,
                      };
              await Promise.all(
                ids.map((id) => patchAssignment({ id, ...patch })),
              );
            })();
          }}
        />
      )}
    </div>
  );
}

function AgendaView({
  assignments,
  courseMap,
  onStatus,
}: {
  assignments: Assignment[];
  courseMap: Map<string, Course>;
  onStatus: (id: string, status: AssignmentStatus) => void;
}) {
  const open = assignments
    .filter((a) => !isClosedAssignmentStatus(a.status) && a.dueAt)
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  const undated = assignments.filter(
    (a) => !isClosedAssignmentStatus(a.status) && !a.dueAt,
  );

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
      <h3 className="display text-xl">Upcoming</h3>
      <ul className="mt-4 space-y-2">
        {open.map((a) => {
          const c = a.courseId ? courseMap.get(a.courseId) : null;
          return (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {c && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: c.color }}
                    />
                  )}
                  <span className="font-medium">
                    {a.link ? (
                      <a
                        href={
                          /^https?:\/\//i.test(a.link)
                            ? a.link
                            : `https://${a.link}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        {a.title}
                      </a>
                    ) : (
                      a.title
                    )}
                  </span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {c?.code || c?.name || "General"} · {formatDueDate(a.dueAt)}
                </div>
              </div>
              <select
                className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs"
                value={a.status}
                onChange={(e) =>
                  onStatus(a.id, e.target.value as AssignmentStatus)
                }
              >
                {ASSIGNMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
        {!open.length && (
          <li className="text-sm text-[var(--muted)]">Nothing upcoming.</li>
        )}
      </ul>
      {undated.length > 0 && (
        <>
          <h4 className="mt-6 text-sm font-medium text-[var(--muted)]">
            No due date
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {undated.map((a) => (
              <li key={a.id}>{a.title}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ProgressView({
  assignments,
  courses,
}: {
  assignments: Assignment[];
  courses: Course[];
}) {
  const [sortBy, setSortBy] = useState<
    "name" | "percent" | "remaining" | "total"
  >("percent");

  const cards = courses.map((c) => {
    const mine = assignments.filter((a) => a.courseId === c.id);
    const countable = mine.filter((a) => a.status !== "n_a");
    const done = countable.filter(
      (a) => a.status === "complete" || a.status === "submitted",
    ).length;
    const remaining = countable.length - done;
    const pct = countable.length
      ? Math.round((done / countable.length) * 100)
      : 0;
    return { course: c, mine, done, remaining, pct, total: countable.length };
  });

  cards.sort((a, b) => {
    if (sortBy === "name") {
      return (a.course.code || a.course.name).localeCompare(
        b.course.code || b.course.name,
      );
    }
    if (sortBy === "percent") return b.pct - a.pct;
    if (sortBy === "remaining") return b.remaining - a.remaining;
    return b.total - a.total;
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Sort by</span>
        {(
          [
            ["percent", "% complete"],
            ["remaining", "Remaining"],
            ["total", "Total"],
            ["name", "Name"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSortBy(id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              sortBy === id
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-[var(--card)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ course: c, done, total, pct }) => (
          <div
            key={c.id}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5"
            style={{ borderTopColor: c.color, borderTopWidth: 3 }}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: c.color }}
              />
              <h3 className="font-medium">{c.code || c.name}</h3>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {c.professor || c.schedule || c.name}
            </p>
            <p className="mt-4 text-2xl font-medium tabular-nums">{pct}%</p>
            <p className="text-sm text-[var(--muted)]">
              {done} / {total} complete or submitted
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: c.color }}
              />
            </div>
          </div>
        ))}
        {!courses.length && (
          <p className="text-sm text-[var(--muted)]">
            Add classes in Groups to see progress cards.
          </p>
        )}
      </div>
    </section>
  );
}

function CalendarView({
  month,
  setMonth,
  assignments,
  courseMap,
  onMoveDay,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  assignments: Assignment[];
  courseMap: Map<string, Course>;
  onMoveDay: (ids: string[], dueAt: string) => void;
}) {
  const year = month.getFullYear();
  const mo = month.getMonth();
  const firstDow = new Date(year, mo, 1).getDay();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overDay, setOverDay] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function itemsForDay(day: number) {
    return assignments.filter((a) => {
      if (!a.dueAt || isClosedAssignmentStatus(a.status)) return false;
      const p = dueDateParts(a.dueAt);
      return p && p.year === year && p.month === mo && p.day === day;
    });
  }

  function dateForDay(day: number): string {
    const m = String(mo + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  }

  function selectCard(
    id: string,
    dayItems: Assignment[],
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    const ids = dayItems.map((a) => a.id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelected && ids.includes(lastSelected)) {
        const a = ids.indexOf(lastSelected);
        const b = ids.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) next.add(ids[i]!);
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else if (next.has(id) && next.size > 1) {
        // keep multi-select so drag can move the group
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
    setLastSelected(id);
  }

  function idsToMove(primary: string): string[] {
    if (selected.has(primary) && selected.size > 0) {
      return Array.from(selected);
    }
    return [primary];
  }

  return (
    <section className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
        <button
          type="button"
          className="rounded-lg px-3 py-1 text-sm text-[var(--muted)] hover:bg-black/5"
          onClick={() => setMonth(new Date(year, mo - 1, 1))}
        >
          ←
        </button>
        <h3 className="display text-2xl">
          {month.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <button
          type="button"
          className="rounded-lg px-3 py-1 text-sm text-[var(--muted)] hover:bg-black/5"
          onClick={() => setMonth(new Date(year, mo + 1, 1))}
        >
          →
        </button>
      </div>
      <p className="mb-3 text-center text-xs text-[var(--muted)]">
        Click to select · ⌘/Ctrl+click multi · Shift+click range · drag onto a
        day
        {selected.size > 0 && (
          <>
            {" · "}
            <button
              type="button"
              className="underline"
              onClick={() => setSelected(new Set())}
            >
              clear {selected.size} selected
            </button>
          </>
        )}
      </p>
      <div className="grid grid-cols-7 gap-px text-center text-xs text-[var(--muted)]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2 font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-[70vh] grid-cols-7 gap-px bg-[var(--line)]">
        {cells.map((day, i) => (
          <div
            key={i}
            onDragOver={(e) => {
              if (!day) return;
              e.preventDefault();
              setOverDay(day);
            }}
            onDragLeave={() => setOverDay((d) => (d === day ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              if (!day) return;
              let ids: string[] = [];
              try {
                const raw = e.dataTransfer.getData("text/assignment-ids");
                if (raw) ids = JSON.parse(raw) as string[];
              } catch {
                /* ignore */
              }
              if (!ids.length) {
                const one =
                  e.dataTransfer.getData("text/assignment-id") || dragIds[0];
                if (one) ids = [one];
              }
              if (ids.length) onMoveDay(ids, dateForDay(day));
              setDragIds([]);
              setOverDay(null);
              setSelected(new Set());
            }}
            className={`min-h-[7.5rem] p-2 text-left sm:min-h-[9rem] ${
              overDay === day
                ? "bg-[var(--accent-soft)]"
                : "bg-[var(--bg)]"
            }`}
          >
            {day && (
              <>
                <div className="text-sm font-medium text-[var(--muted)]">
                  {day}
                </div>
                <div className="mt-1 space-y-1">
                  {itemsForDay(day).map((a) => {
                    const c = a.courseId ? courseMap.get(a.courseId) : null;
                    const isSel = selected.has(a.id);
                    const isDragging = dragIds.includes(a.id);
                    return (
                      <div
                        key={a.id}
                        draggable
                        onClick={(e) => selectCard(a.id, itemsForDay(day), e)}
                        onDragStart={(e) => {
                          const ids = idsToMove(a.id);
                          setDragIds(ids);
                          e.dataTransfer.setData(
                            "text/assignment-ids",
                            JSON.stringify(ids),
                          );
                          e.dataTransfer.setData("text/assignment-id", a.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragIds([]);
                          setOverDay(null);
                        }}
                        className={`cursor-grab truncate rounded px-1.5 py-1 text-[11px] text-white active:cursor-grabbing ${
                          isDragging ? "opacity-40" : ""
                        } ${isSel ? "ring-2 ring-white ring-offset-1 ring-offset-black/20" : ""}`}
                        style={{ background: c?.color || "var(--accent)" }}
                        title={`${a.title}${isSel && selected.size > 1 ? ` (+${selected.size - 1} more)` : ""}`}
                      >
                        {a.title}
                        {isSel && selected.size > 1 && dragIds[0] === a.id
                          ? ` · ${selected.size}`
                          : ""}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function KanbanView({
  assignments,
  courses,
  kanbanBy,
  setKanbanBy,
  onDropCards,
}: {
  assignments: Assignment[];
  courses: Course[];
  kanbanBy: KanbanBy;
  setKanbanBy: (v: KanbanBy) => void;
  onDropCards: (ids: string[], columnId: string) => void;
}) {
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setLastSelected(null);
  }, [kanbanBy]);

  const columns = useMemo(() => {
    if (kanbanBy === "status") {
      return ASSIGNMENT_STATUSES.map((s) => ({
        id: s,
        label: STATUS_LABEL[s],
        items: assignments.filter((a) => a.status === s),
      }));
    }
    if (kanbanBy === "difficulty") {
      return ASSIGNMENT_DIFFICULTIES.map((d) => ({
        id: d,
        label: d,
        items: assignments.filter((a) => a.difficulty === d),
      }));
    }
    const cols = courses.map((c) => ({
      id: c.id,
      label: c.code || c.name,
      color: c.color,
      items: assignments.filter((a) => a.courseId === c.id),
    }));
    cols.push({
      id: "none",
      label: "Unassigned",
      color: "#94a3b8",
      items: assignments.filter((a) => !a.courseId),
    });
    return cols;
  }, [assignments, courses, kanbanBy]);

  function selectCard(
    id: string,
    columnItems: Assignment[],
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    const ids = columnItems.map((a) => a.id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelected && ids.includes(lastSelected)) {
        const a = ids.indexOf(lastSelected);
        const b = ids.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) next.add(ids[i]!);
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else if (next.has(id) && next.size > 1) {
        // keep group for drag
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
    setLastSelected(id);
  }

  function idsToMove(primary: string): string[] {
    if (selected.has(primary) && selected.size > 0) {
      return Array.from(selected);
    }
    return [primary];
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["status", "By progress"],
            ["class", "By class"],
            ["difficulty", "By difficulty"],
          ] as [KanbanBy, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKanbanBy(id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              kanbanBy === id
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-[var(--card)]"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="self-center text-xs text-[var(--muted)]">
          Click · ⌘/Ctrl+click · Shift+click, then drag the group
          {selected.size > 0 && (
            <>
              {" · "}
              <button
                type="button"
                className="underline"
                onClick={() => setSelected(new Set())}
              >
                clear {selected.size}
              </button>
            </>
          )}
        </span>
      </div>
      <div className={kanbanBoardClass} style={kanbanBoardStyle(columns.length)}>
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.id);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              let ids: string[] = [];
              try {
                const raw = e.dataTransfer.getData("text/assignment-ids");
                if (raw) ids = JSON.parse(raw) as string[];
              } catch {
                /* ignore */
              }
              if (!ids.length) {
                const one =
                  e.dataTransfer.getData("text/assignment-id") || dragIds[0];
                if (one) ids = [one];
              }
              if (ids.length) onDropCards(ids, col.id);
              setDragIds([]);
              setOverCol(null);
              setSelected(new Set());
            }}
            className={`${kanbanColumnClass} bg-[var(--card)] ${
              overCol === col.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                : "border-[var(--line)]"
            }`}
          >
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium sm:text-sm">
              {"color" in col && col.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: String(col.color) }}
                />
              )}
              <span className="min-w-0 truncate">{col.label}</span>
              <span className="text-[var(--muted)]">({col.items.length})</span>
            </div>
            <div className={kanbanColumnBodyClass}>
              {col.items.map((a) => {
                const isSel = selected.has(a.id);
                const isDragging = dragIds.includes(a.id);
                return (
                  <div
                    key={a.id}
                    draggable
                    onClick={(e) => selectCard(a.id, col.items, e)}
                    onDragStart={(e) => {
                      const ids = idsToMove(a.id);
                      setDragIds(ids);
                      e.dataTransfer.setData(
                        "text/assignment-ids",
                        JSON.stringify(ids),
                      );
                      e.dataTransfer.setData("text/assignment-id", a.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragIds([]);
                      setOverCol(null);
                    }}
                    className={`cursor-grab rounded-lg border px-2 py-2 active:cursor-grabbing sm:rounded-xl sm:px-3 sm:py-2.5 ${
                      isSel
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]/60 ring-2 ring-[var(--accent)]"
                        : "border-[var(--line)] bg-white/90"
                    } ${
                      isSubmittedStyle(a.status)
                        ? "bg-stone-100 text-[var(--muted)] line-through opacity-70"
                        : ""
                    } ${isDragging ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-xs font-medium leading-snug sm:text-sm">
                        {a.title}
                      </div>
                      {isSel && selected.size > 1 && (
                        <span className="shrink-0 text-[10px] text-[var(--accent)]">
                          {selected.size}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--muted)] no-underline sm:text-xs">
                      {a.dueAt ? formatDueDate(a.dueAt) : "No due date"}
                    </div>
                  </div>
                );
              })}
              {!col.items.length && (
                <p className="py-6 text-center text-xs text-[var(--muted)]">
                  Drop here
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
