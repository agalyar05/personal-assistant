"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fillDateSeries,
  fillTitleSeries,
  fromInputDateTime,
  toInputDateTime,
} from "@/lib/fill";
import type {
  Assignment,
  AssignmentDifficulty,
  AssignmentStatus,
  Course,
} from "@/lib/types";
import {
  ASSIGNMENT_DIFFICULTIES,
  ASSIGNMENT_STATUSES,
} from "@/lib/types";
import { ThemePicker, useUiTheme } from "@/components/ThemePicker";

type View = "sheet" | "calendar" | "kanban";
type KanbanBy = "status" | "class" | "difficulty";
type FillMode = "auto" | "daily" | "weekly";
type ColKey =
  | "title"
  | "courseId"
  | "status"
  | "dueAt"
  | "assignmentType"
  | "difficulty"
  | "pointsEarned"
  | "pointsPossible"
  | "notes";

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  complete: "Complete",
};

export default function AssignmentsPage() {
  const { theme, saveTheme } = useUiTheme();
  const [view, setView] = useState<View>("sheet");
  const [kanbanBy, setKanbanBy] = useState<KanbanBy>("status");
  const [fillMode, setFillMode] = useState<FillMode>("weekly");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [msg, setMsg] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [courseForm, setCourseForm] = useState({
    name: "",
    code: "",
    color: "#0f766e",
  });
  const [selected, setSelected] = useState<{
    rowId: string;
    col: ColKey;
  } | null>(null);
  const [fillRows, setFillRows] = useState(4);

  const load = useCallback(async () => {
    const res = await fetch("/api/assignments");
    const json = await res.json();
    setAssignments(json.assignments || []);
    setCourses(json.courses || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const courseMap = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );

  async function saveAssignment(patch: Partial<Assignment> & { title: string; id?: string }) {
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setMsg("Save failed");
      return;
    }
    await load();
  }

  async function addBlankRow() {
    await saveAssignment({
      title: "New assignment",
      status: "not_started",
      difficulty: "medium",
      assignmentType: "Homework",
      sortOrder: assignments.length + 1,
    });
    setMsg("Row added — edit title / drag-fill to expand");
  }

  async function removeRow(id: string) {
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    await load();
  }

  async function addCourse() {
    if (!courseForm.name.trim()) return;
    await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseForm),
    });
    setCourseForm({ name: "", code: "", color: "#0f766e" });
    await load();
  }

  async function runFillDown() {
    if (!selected) {
      setMsg("Click a cell first, then Fill down");
      return;
    }
    const sorted = [...assignments].sort((a, b) => a.sortOrder - b.sortOrder);
    const startIdx = sorted.findIndex((a) => a.id === selected.rowId);
    if (startIdx < 0) return;
    const seed = sorted[startIdx]!;
    const count = fillRows;
    const rows: (Partial<Assignment> & { title: string })[] = [];

    if (selected.col === "title") {
      const titles = fillTitleSeries(seed.title, count);
      for (let i = 0; i < count; i++) {
        const existing = sorted[startIdx + i];
        if (existing) {
          rows.push({ ...existing, title: titles[i]! });
        } else {
          rows.push({
            title: titles[i]!,
            courseId: seed.courseId,
            status: seed.status,
            dueAt: null,
            assignmentType: seed.assignmentType,
            difficulty: seed.difficulty,
            sortOrder: (seed.sortOrder || startIdx + 1) + i,
          });
        }
      }
    } else if (selected.col === "dueAt") {
      const seeds = [
        toInputDateTime(seed.dueAt),
        toInputDateTime(sorted[startIdx + 1]?.dueAt || null),
      ];
      const dates = fillDateSeries(seeds, count, fillMode);
      for (let i = 0; i < count; i++) {
        const existing = sorted[startIdx + i];
        const dueAt = fromInputDateTime(dates[i] || "");
        if (existing) {
          rows.push({ ...existing, title: existing.title, dueAt });
        } else {
          const titles = fillTitleSeries(seed.title, count);
          rows.push({
            title: titles[i] || `${seed.title} ${i + 1}`,
            courseId: seed.courseId,
            status: "not_started",
            dueAt,
            assignmentType: seed.assignmentType,
            difficulty: seed.difficulty,
            sortOrder: (seed.sortOrder || startIdx + 1) + i,
          });
        }
      }
    } else {
      setMsg("Fill down works on Title or Due columns");
      return;
    }

    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk", rows }),
    });
    setMsg(
      selected.col === "dueAt"
        ? `Filled ${count} due dates (${fillMode})`
        : `Filled ${count} titles`,
    );
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-2xl">Assignments</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Spreadsheet fill-down, calendar, and kanban — text{" "}
              <code className="text-[var(--ink)]">due today</code> anytime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["sheet", "Sheet"],
                ["calendar", "Calendar"],
                ["kanban", "Kanban"],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
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
        {msg && <p className="mt-3 text-sm text-[var(--accent)]">{msg}</p>}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Color palette
        </h3>
        <div className="mt-3">
          <ThemePicker theme={theme} onChange={saveTheme} />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Classes
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {courses.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1 text-sm"
              style={{ borderColor: c.color }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: c.color }}
              />
              {c.code || c.name}
            </span>
          ))}
          {!courses.length && (
            <span className="text-sm text-[var(--muted)]">No classes yet</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            placeholder="Class name"
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={courseForm.name}
            onChange={(e) =>
              setCourseForm({ ...courseForm, name: e.target.value })
            }
          />
          <input
            placeholder="Code"
            className="w-28 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={courseForm.code}
            onChange={(e) =>
              setCourseForm({ ...courseForm, code: e.target.value })
            }
          />
          <input
            type="color"
            className="h-10 w-12 rounded border border-[var(--line)]"
            value={courseForm.color}
            onChange={(e) =>
              setCourseForm({ ...courseForm, color: e.target.value })
            }
          />
          <button
            type="button"
            onClick={addCourse}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            Add class
          </button>
        </div>
      </section>

      {view === "sheet" && (
        <section className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addBlankRow}
              className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
            >
              + Row
            </button>
            <label className="text-sm text-[var(--muted)]">
              Fill
              <select
                className="ml-1 rounded-lg border border-[var(--line)] bg-white px-2 py-1"
                value={fillMode}
                onChange={(e) => setFillMode(e.target.value as FillMode)}
              >
                <option value="weekly">weekly (+7 days)</option>
                <option value="daily">daily (+1 day)</option>
                <option value="auto">auto from pattern</option>
              </select>
            </label>
            <label className="text-sm text-[var(--muted)]">
              rows
              <input
                type="number"
                min={1}
                max={30}
                className="ml-1 w-16 rounded-lg border border-[var(--line)] bg-white px-2 py-1"
                value={fillRows}
                onChange={(e) => setFillRows(Number(e.target.value) || 1)}
              />
            </label>
            <button
              type="button"
              onClick={runFillDown}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
            >
              Fill down
            </button>
            <span className="text-xs text-[var(--muted)]">
              Tip: click Title or Due cell → Fill down (Assignment 1→2…, weekly dates)
            </span>
          </div>
          <table className="min-w-[1100px] w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                {[
                  "Title",
                  "Class",
                  "Status",
                  "Due",
                  "Type",
                  "Difficulty",
                  "Earned",
                  "Possible",
                  "Notes",
                  "",
                ].map((h) => (
                  <th key={h} className="border-b border-[var(--line)] px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="align-top">
                  <Td
                    active={selected?.rowId === a.id && selected.col === "title"}
                    onSelect={() => setSelected({ rowId: a.id, col: "title" })}
                  >
                    <input
                      className="w-full bg-transparent outline-none"
                      value={a.title}
                      onChange={(e) =>
                        setAssignments((prev) =>
                          prev.map((x) =>
                            x.id === a.id ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={() =>
                        saveAssignment({ id: a.id, title: a.title || "Untitled" })
                      }
                    />
                  </Td>
                  <Td
                    active={selected?.rowId === a.id && selected.col === "courseId"}
                    onSelect={() => setSelected({ rowId: a.id, col: "courseId" })}
                  >
                    <select
                      className="w-full bg-transparent outline-none"
                      value={a.courseId || ""}
                      onChange={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          courseId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">—</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code || c.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td
                    active={selected?.rowId === a.id && selected.col === "status"}
                    onSelect={() => setSelected({ rowId: a.id, col: "status" })}
                  >
                    <select
                      className="w-full bg-transparent outline-none"
                      value={a.status}
                      onChange={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          status: e.target.value as AssignmentStatus,
                        })
                      }
                    >
                      {ASSIGNMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td
                    active={selected?.rowId === a.id && selected.col === "dueAt"}
                    onSelect={() => setSelected({ rowId: a.id, col: "dueAt" })}
                  >
                    <input
                      type="datetime-local"
                      className="w-full bg-transparent outline-none"
                      value={toInputDateTime(a.dueAt)}
                      onChange={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          dueAt: fromInputDateTime(e.target.value),
                        })
                      }
                    />
                  </Td>
                  <Td
                    active={
                      selected?.rowId === a.id && selected.col === "assignmentType"
                    }
                    onSelect={() =>
                      setSelected({ rowId: a.id, col: "assignmentType" })
                    }
                  >
                    <input
                      className="w-full bg-transparent outline-none"
                      value={a.assignmentType}
                      onBlur={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          assignmentType: e.target.value,
                        })
                      }
                      onChange={(e) =>
                        setAssignments((prev) =>
                          prev.map((x) =>
                            x.id === a.id
                              ? { ...x, assignmentType: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </Td>
                  <Td
                    active={
                      selected?.rowId === a.id && selected.col === "difficulty"
                    }
                    onSelect={() =>
                      setSelected({ rowId: a.id, col: "difficulty" })
                    }
                  >
                    <select
                      className="w-full bg-transparent outline-none"
                      value={a.difficulty}
                      onChange={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          difficulty: e.target.value as AssignmentDifficulty,
                        })
                      }
                    >
                      {ASSIGNMENT_DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td
                    active={
                      selected?.rowId === a.id && selected.col === "pointsEarned"
                    }
                    onSelect={() =>
                      setSelected({ rowId: a.id, col: "pointsEarned" })
                    }
                  >
                    <input
                      type="number"
                      className="w-20 bg-transparent outline-none"
                      value={a.pointsEarned ?? ""}
                      onChange={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          pointsEarned: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  </Td>
                  <Td
                    active={
                      selected?.rowId === a.id &&
                      selected.col === "pointsPossible"
                    }
                    onSelect={() =>
                      setSelected({ rowId: a.id, col: "pointsPossible" })
                    }
                  >
                    <input
                      type="number"
                      className="w-20 bg-transparent outline-none"
                      value={a.pointsPossible ?? ""}
                      onChange={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          pointsPossible: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  </Td>
                  <Td
                    active={selected?.rowId === a.id && selected.col === "notes"}
                    onSelect={() => setSelected({ rowId: a.id, col: "notes" })}
                  >
                    <input
                      className="w-40 bg-transparent outline-none"
                      value={a.notes}
                      onBlur={(e) =>
                        saveAssignment({
                          id: a.id,
                          title: a.title,
                          notes: e.target.value,
                        })
                      }
                      onChange={(e) =>
                        setAssignments((prev) =>
                          prev.map((x) =>
                            x.id === a.id ? { ...x, notes: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </Td>
                  <td className="border-b border-[var(--line)] px-2 py-1">
                    <button
                      type="button"
                      className="text-xs text-red-700"
                      onClick={() => removeRow(a.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!assignments.length && (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No assignments yet — add a row to start.
            </p>
          )}
        </section>
      )}

      {view === "calendar" && (
        <CalendarView
          month={month}
          setMonth={setMonth}
          assignments={assignments}
          courseMap={courseMap}
        />
      )}

      {view === "kanban" && (
        <KanbanView
          assignments={assignments}
          courses={courses}
          kanbanBy={kanbanBy}
          setKanbanBy={setKanbanBy}
          onStatus={(id, status, title) =>
            saveAssignment({ id, title, status })
          }
        />
      )}
    </div>
  );
}

function Td({
  children,
  active,
  onSelect,
}: {
  children: React.ReactNode;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <td
      className={`border-b border-[var(--line)] px-2 py-1 ${
        active ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : ""
      }`}
      onClick={onSelect}
    >
      {children}
    </td>
  );
}

function CalendarView({
  month,
  setMonth,
  assignments,
  courseMap,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  assignments: Assignment[];
  courseMap: Map<string, Course>;
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

  function itemsForDay(day: number) {
    return assignments.filter((a) => {
      if (!a.dueAt) return false;
      const d = new Date(a.dueAt);
      return (
        d.getFullYear() === year &&
        d.getMonth() === mo &&
        d.getDate() === day &&
        a.status !== "complete"
      );
    });
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
          onClick={() => setMonth(new Date(year, mo - 1, 1))}
        >
          ←
        </button>
        <h3 className="display text-xl">
          {month.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
          onClick={() => setMonth(new Date(year, mo + 1, 1))}
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--muted)]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className="min-h-24 rounded-xl border border-[var(--line)] bg-white/60 p-1.5 text-left"
          >
            {day && (
              <>
                <div className="text-xs font-medium text-[var(--muted)]">
                  {day}
                </div>
                <div className="mt-1 space-y-1">
                  {itemsForDay(day).map((a) => {
                    const c = a.courseId ? courseMap.get(a.courseId) : null;
                    return (
                      <div
                        key={a.id}
                        className="truncate rounded px-1 py-0.5 text-[10px] text-white"
                        style={{ background: c?.color || "var(--accent)" }}
                        title={a.title}
                      >
                        {a.title}
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
  onStatus,
}: {
  assignments: Assignment[];
  courses: Course[];
  kanbanBy: KanbanBy;
  setKanbanBy: (v: KanbanBy) => void;
  onStatus: (id: string, status: AssignmentStatus, title: string) => void;
}) {
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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["status", "By status"],
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
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            className="w-64 shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              {"color" in col && col.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: String(col.color) }}
                />
              )}
              {col.label}
              <span className="text-[var(--muted)]">({col.items.length})</span>
            </div>
            <div className="space-y-2">
              {col.items.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-[var(--line)] bg-white/80 p-3"
                >
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {a.dueAt
                      ? new Date(a.dueAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "No due date"}
                  </div>
                  {kanbanBy !== "status" && (
                    <select
                      className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs"
                      value={a.status}
                      onChange={(e) =>
                        onStatus(
                          a.id,
                          e.target.value as AssignmentStatus,
                          a.title,
                        )
                      }
                    >
                      {ASSIGNMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {!col.items.length && (
                <p className="text-xs text-[var(--muted)]">Empty</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
