"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Assignment, AssignmentStatus, Course } from "@/lib/types";
import {
  ASSIGNMENT_DIFFICULTIES,
  ASSIGNMENT_STATUSES,
} from "@/lib/types";
import { ThemePicker, useUiTheme } from "@/components/ThemePicker";
import { AssignmentSheet } from "@/components/AssignmentSheet";

type View = "sheet" | "calendar" | "kanban";
type KanbanBy = "status" | "class" | "difficulty";

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
    setAssignments((prev) =>
      prev.map((a) => (a.id === patch.id ? { ...a, ...patch } : a)),
    );
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setMsg("Save failed");
      await load();
      return;
    }
    const json = await res.json();
    if (json.assignment) {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === json.assignment.id
            ? { ...json.assignment, link: json.assignment.link || "" }
            : a,
        ),
      );
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
    setMsg("Row added — edit title / use Fill down");
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

  async function addCourse() {
    if (!courseForm.name.trim()) return;
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseForm),
    });
    const json = await res.json();
    if (json.course) {
      setCourses((prev) => [...prev, json.course]);
    } else {
      const all = await fetch("/api/courses").then((r) => r.json());
      setCourses(all.courses || []);
    }
    setCourseForm({ name: "", code: "", color: "#0f766e" });
    setMsg("Class added");
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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-2xl">Assignments</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Spreadsheet-style grid — drag columns, fill down, link titles.
              Text <code className="text-[var(--ink)]">due today</code>.
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
            onClick={() => void addCourse()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            Add class
          </button>
        </div>
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
          onStatus={(id, status) => void patchAssignment({ id, status })}
        />
      )}
    </div>
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
  onStatus: (id: string, status: AssignmentStatus) => void;
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
                  <div className="text-sm font-medium">
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
                  </div>
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
                        onStatus(a.id, e.target.value as AssignmentStatus)
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
