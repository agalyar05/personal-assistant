"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Application,
  ApplicationKind,
  ApplicationStatus,
  Assignment,
  AssignmentStatus,
  Course,
} from "@/lib/types";
import {
  ASSIGNMENT_DIFFICULTIES,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_LABELS,
  isClosedAssignmentStatus,
  isSubmittedStyle,
} from "@/lib/types";
import { CelebrationBurst } from "@/components/CelebrationBurst";
import { dueDateParts, formatDueDate, withinTaskHorizon } from "@/lib/fill";
import {
  applyColumnOrder,
  KANBAN_COLUMN_DRAG_TYPE,
  kanbanBoardClass,
  kanbanBoardStyle,
  kanbanColumnBodyClass,
  kanbanColumnClass,
  reorderColumnIds,
} from "@/lib/kanban-layout";
import { normalizeApplicationUrl } from "@/lib/applications";
import { computeCourseProgress } from "@/lib/course-progress";
import { APPLICATION_STATUS_LABELS } from "@/lib/application-meta";
import { isApplicationsGroup } from "@/lib/courses";
import {
  appIdFromSheetId,
  applicationToSheetRow,
  assignmentStatusToApp,
  isAppSheetId,
} from "@/lib/app-sheet";
import { faintClassTint } from "@/lib/themes";

const AssignmentSheet = dynamic(
  () =>
    import("@/components/AssignmentSheet").then((m) => ({
      default: m.AssignmentSheet,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-[var(--muted)]">Loading sheet…</p>
    ),
  },
);

type View = "sheet" | "calendar" | "kanban" | "agenda" | "progress";
type KanbanBy = "status" | "class" | "difficulty";
type CalRange = "month" | "week";
type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

const STATUS_LABEL = ASSIGNMENT_STATUS_LABELS;
const WEEK_START_KEY = "pa_cal_week_start";
const CAL_RANGE_KEY = "pa_cal_range";
const DEFAULT_VIEW_KEY = "pa_masterlist_default_view";
const APP_CLOSED = new Set(["accepted", "rejected", "withdrawn"]);
const ALL_VIEWS: View[] = ["sheet", "agenda", "calendar", "kanban", "progress"];

function isView(v: string): v is View {
  return (ALL_VIEWS as string[]).includes(v);
}

function startOfWeek(d: Date, weekStartsOn: WeekStart): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdayLabels(weekStartsOn: WeekStart): string[] {
  const all = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...all.slice(weekStartsOn), ...all.slice(0, weekStartsOn)];
}

export default function AssignmentsPage() {
  const [view, setView] = useState<View>("sheet");
  const [defaultView, setDefaultView] = useState<View>("sheet");
  const [kanbanBy, setKanbanBy] = useState<KanbanBy>("status");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [taskHorizonDays, setTaskHorizonDays] = useState(7);
  const [msg, setMsg] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), 0));
  const [calRange, setCalRange] = useState<CalRange>("month");
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStart>(0);

  const load = useCallback(async () => {
    const [aRes, appRes, sRes] = await Promise.all([
      fetch("/api/assignments"),
      fetch("/api/applications"),
      fetch("/api/settings?slim=1"),
    ]);
    const json = await aRes.json();
    setAssignments(
      (json.assignments || []).map((a: Assignment) => ({
        ...a,
        link: a.link || "",
      })),
    );
    setCourses(json.courses || []);
    if (appRes.ok) {
      const appJson = await appRes.json();
      setApplications(appJson.applications || []);
    }
    if (sRes.ok) {
      const sJson = await sRes.json();
      setTaskHorizonDays(Number(sJson.settings?.taskHorizonDays ?? 7));
    }
  }, []);

  /** Refresh rows without re-fetching settings (avoids Thinking sheet payload). */
  const refreshRows = useCallback(async () => {
    const [aRes, appRes] = await Promise.all([
      fetch("/api/assignments"),
      fetch("/api/applications"),
    ]);
    const json = await aRes.json();
    setAssignments(
      (json.assignments || []).map((a: Assignment) => ({
        ...a,
        link: a.link || "",
      })),
    );
    setCourses(json.courses || []);
    if (appRes.ok) {
      const appJson = await appRes.json();
      setApplications(appJson.applications || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      const ws = localStorage.getItem(WEEK_START_KEY);
      if (ws === "1" || ws === "0") {
        const v = Number(ws) as WeekStart;
        setWeekStartsOn(v);
        setWeekAnchor((prev) => startOfWeek(prev, v));
      }
      const range = localStorage.getItem(CAL_RANGE_KEY);
      if (range === "week" || range === "month") setCalRange(range);
      const dv = localStorage.getItem(DEFAULT_VIEW_KEY);
      if (dv && isView(dv)) {
        setDefaultView(dv);
        setView(dv);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const courseMap = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );

  const openApps = useMemo(
    () => applications.filter((a) => !APP_CLOSED.has(a.status)),
    [applications],
  );

  const applicationsGroup = useMemo(
    () => courses.find(isApplicationsGroup) || null,
    [courses],
  );

  /** Sheet / agenda / kanban — calendar uses full `assignments`. */
  const horizonAssignments = useMemo(
    () =>
      assignments.filter((a) => withinTaskHorizon(a.dueAt, taskHorizonDays)),
    [assignments, taskHorizonDays],
  );

  const horizonApps = useMemo(
    () =>
      openApps.filter(
        (a) => !a.deadline || withinTaskHorizon(a.deadline, taskHorizonDays),
      ),
    [openApps, taskHorizonDays],
  );

  /** Assignments + applications as sheet/kanban rows (manual sortOrder wins). */
  const sheetRows = useMemo(() => {
    const appsCourseId = applicationsGroup?.id || null;
    const appRows = horizonApps.map((a) =>
      applicationToSheetRow(a, appsCourseId),
    );
    return [...horizonAssignments, ...appRows].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
  }, [horizonAssignments, horizonApps, applicationsGroup?.id]);

  async function patchApplicationFromSheet(
    patch: Partial<Assignment> & { id: string },
  ) {
    const realId = appIdFromSheetId(patch.id);
    const app = applications.find((a) => a.id === realId);
    if (!app) return;
    const body: Record<string, unknown> = {
      id: realId,
      title: patch.title !== undefined ? patch.title : app.title,
    };
    if (patch.link !== undefined) body.url = patch.link;
    if (patch.dueAt !== undefined) body.deadline = patch.dueAt;
    if (patch.assignmentType !== undefined) {
      body.kind = patch.assignmentType as ApplicationKind;
    }
    if (patch.notes !== undefined) body.notes = patch.notes;
    if (patch.sortOrder !== undefined) body.sortOrder = patch.sortOrder;
    if (patch.status !== undefined) {
      body.status = assignmentStatusToApp(
        patch.status,
        app.status,
      ) as ApplicationStatus;
    }
    // Keep apps pinned to Applications group on sheet
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg("Application save failed");
      await refreshRows();
      return;
    }
    const json = await res.json();
    if (Array.isArray(json.applications)) {
      setApplications(json.applications);
    } else if (json.application) {
      setApplications((prev) =>
        prev.map((a) => (a.id === json.application.id ? json.application : a)),
      );
    }
  }

  async function patchAssignment(patch: Partial<Assignment> & { id: string }) {
    if (isAppSheetId(patch.id)) {
      await patchApplicationFromSheet(patch);
      return;
    }
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
      await refreshRows();
      return;
    }
    if (patch.status === "submitted" && prev?.status !== "submitted") {
      setCelebrate(true);
    }
  }

  async function removeRow(id: string) {
    if (isAppSheetId(id)) {
      const realId = appIdFromSheetId(id);
      await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: realId }),
      });
      setApplications((prev) => prev.filter((a) => a.id !== realId));
      return;
    }
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  async function toggleTodo(id: string, onTodo: boolean) {
    if (isAppSheetId(id)) {
      setMsg("Applications aren't added to .todo from here");
      return;
    }
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "todo", id, onTodo }),
    });
    if (!res.ok) {
      setMsg("Couldn't update .todo");
      await refreshRows();
      return;
    }
    const json = await res.json();
    if (json.assignment) {
      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...json.assignment } : a)),
      );
    } else {
      await refreshRows();
    }
    setMsg(onTodo ? "Added to .todo" : "Removed from .todo");
  }

  /** "+ Row" always inserts at the 4th visible position, not appended at the end. */
  async function addBlankRow() {
    await insertRowAt(3, "above");
  }

  async function insertRowAt(index: number, where: "above" | "below") {
    // Insert into the FULL visible sheet order (assignments + synthetic
    // application rows) and renumber that whole list, same as drag-reorder
    // does via bulkSave. Renumbering only real assignments (as this used to)
    // left application rows' sortOrder stale relative to the freshly
    // renumbered assignments, so rows near the assignment/application
    // boundary would swap places the next time they collided on a value.
    const visible = sheetRows;
    const anchor = visible[index];
    const insertAt = anchor
      ? where === "above"
        ? index
        : index + 1
      : visible.length;

    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New assignment",
        status: "not_started",
        difficulty: "medium",
        assignmentType: "Homework",
        link: "",
        sortOrder: insertAt + 1,
      }),
    });
    if (!res.ok) {
      setMsg("Could not insert row");
      return;
    }
    const created = (await res.json()).assignment as Assignment | undefined;
    if (!created?.id) {
      await refreshRows();
      return;
    }
    const next = [...visible];
    next.splice(insertAt, 0, created);
    await bulkSave(
      next.map((row, i) => ({
        id: row.id,
        title: row.title,
        sortOrder: i + 1,
      })),
    );
    setMsg(where === "above" ? "Row inserted above" : "Row inserted below");
  }

  async function addInKanbanColumn(columnId: string, title = "New assignment") {
    const trimmed = title.trim();
    if (!trimmed) return;
    const body: Record<string, unknown> = {
      title: trimmed,
      status: "not_started",
      difficulty: "medium",
      assignmentType: "Homework",
      link: "",
      sortOrder: assignments.length + 1,
    };
    if (kanbanBy === "status") body.status = columnId;
    if (kanbanBy === "difficulty") body.difficulty = columnId;
    if (kanbanBy === "class") {
      body.courseId = columnId === "none" ? null : columnId;
    }
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg("Could not add card");
      return;
    }
    const created = (await res.json()).assignment as Assignment | undefined;
    if (created?.id) {
      setAssignments((prev) => [...prev, { ...created, link: created.link || "" }]);
    } else {
      await refreshRows();
    }
    setMsg("Card added");
  }

  function saveDefaultView(v: View) {
    setDefaultView(v);
    try {
      localStorage.setItem(DEFAULT_VIEW_KEY, v);
    } catch {
      /* ignore */
    }
    setMsg(`Default view: ${v}`);
  }

  async function bulkSave(
    rows: (Partial<Assignment> & { title?: string; id?: string })[],
    opts?: { keepLocal?: boolean },
  ) {
    const appRows = rows.filter((r) => r.id && isAppSheetId(r.id));
    const asnRows = rows.filter((r) => !r.id || !isAppSheetId(r.id));
    // Independent per-application updates — no shared state between them.
    await Promise.all(
      appRows.map((row) =>
        patchApplicationFromSheet(row as Partial<Assignment> & { id: string }),
      ),
    );
    if (asnRows.length) {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", rows: asnRows }),
      });
      if (!res.ok) {
        setMsg("Save failed — reloading");
        await refreshRows();
        return;
      }
      // Reorder/sort already applied optimistically — don't clobber with a
      // partial server list (that flicker: new order → old → new).
      if (opts?.keepLocal) return;
      const json = await res.json();
      if (Array.isArray(json.assignments)) {
        const byId = new Map(
          (json.assignments as Assignment[]).map((a) => [a.id, a]),
        );
        setAssignments((prev) => {
          const merged = prev.map((a) => {
            const u = byId.get(a.id);
            return u ? { ...a, ...u, link: u.link || a.link || "" } : a;
          });
          for (const u of json.assignments as Assignment[]) {
            if (!byId.has(u.id)) continue;
            if (!prev.some((a) => a.id === u.id)) {
              merged.push({ ...u, link: u.link || "" });
            }
          }
          return merged;
        });
        return;
      }
    }
    if (!opts?.keepLocal) await refreshRows();
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
            <h2 className="display text-xl leading-tight">Masterlist</h2>
            <p className="mt-0.5 hidden text-xs text-[var(--muted)] sm:block">
              Classes in{" "}
              <a href="/admin/groups" className="text-[var(--accent)] underline">
                Groups
              </a>
              . Scholarship deadlines from{" "}
              <a
                href="/admin/applications"
                className="text-[var(--accent)] underline"
              >
                Applications
              </a>{" "}
              show on Calendar & Agenda
              {openApps.length ? ` (${openApps.length} open)` : ""}.
              {taskHorizonDays > 0
                ? ` Showing ${taskHorizonDays}d horizon (calendar = all).`
                : " Showing all tasks."}{" "}
              <a href="/admin/settings" className="text-[var(--accent)] underline">
                Settings
              </a>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
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
            <label className="ml-1 flex items-center gap-1 text-[10px] text-[var(--muted)] sm:text-xs">
              Default
              <select
                className="rounded-md border border-[var(--line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)]"
                value={defaultView}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isView(v)) saveDefaultView(v);
                }}
              >
                {views.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {msg && <p className="mt-2 text-sm text-[var(--accent)]">{msg}</p>}
      </section>

      {view === "sheet" && (
        <AssignmentSheet
          assignments={sheetRows}
          courses={courses}
          onChangeLocal={(id, patch) => {
            if (isAppSheetId(id)) {
              const realId = appIdFromSheetId(id);
              setApplications((prev) =>
                prev.map((a) => {
                  if (a.id !== realId) return a;
                  const next = { ...a };
                  if (patch.title !== undefined) next.title = patch.title;
                  if (patch.link !== undefined) next.url = patch.link || "";
                  if (patch.dueAt !== undefined) next.deadline = patch.dueAt;
                  if (patch.assignmentType !== undefined) {
                    next.kind = patch.assignmentType as ApplicationKind;
                  }
                  if (patch.notes !== undefined) next.notes = patch.notes;
                  if (patch.status !== undefined) {
                    next.status = assignmentStatusToApp(patch.status, a.status);
                  }
                  if (patch.sortOrder !== undefined) {
                    next.sortOrder = patch.sortOrder;
                  }
                  return next;
                }),
              );
              return;
            }
            setAssignments((prev) =>
              prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
            );
          }}
          onApplySortOrders={(orders) => {
            const byId = new Map(orders.map((o) => [o.id, o.sortOrder]));
            setAssignments((prev) =>
              prev.map((a) =>
                byId.has(a.id) ? { ...a, sortOrder: byId.get(a.id)! } : a,
              ),
            );
            setApplications((prev) =>
              prev.map((a) => {
                const key = `app:${a.id}`;
                return byId.has(key)
                  ? { ...a, sortOrder: byId.get(key)! }
                  : a;
              }),
            );
          }}
          onPatch={patchAssignment}
          onAddRow={addBlankRow}
          onInsertRow={insertRowAt}
          onDelete={removeRow}
          onBulk={bulkSave}
          onToggleTodo={toggleTodo}
          onMsg={setMsg}
        />
      )}

      {view === "agenda" && (
        <AgendaView
          assignments={horizonAssignments}
          applications={horizonApps}
          applicationsColor={applicationsGroup?.color || "#a16207"}
          courseMap={courseMap}
          onStatus={(id, status) => void patchAssignment({ id, status })}
        />
      )}

      {view === "calendar" && (
        <CalendarView
          month={month}
          setMonth={setMonth}
          weekAnchor={weekAnchor}
          setWeekAnchor={setWeekAnchor}
          calRange={calRange}
          setCalRange={(r) => {
            setCalRange(r);
            try {
              localStorage.setItem(CAL_RANGE_KEY, r);
            } catch {
              /* ignore */
            }
          }}
          weekStartsOn={weekStartsOn}
          setWeekStartsOn={(v) => {
            setWeekStartsOn(v);
            setWeekAnchor((prev) => startOfWeek(prev, v));
            try {
              localStorage.setItem(WEEK_START_KEY, String(v));
            } catch {
              /* ignore */
            }
          }}
          assignments={assignments}
          applications={openApps}
          applicationsColor={applicationsGroup?.color || "#a16207"}
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
          assignments={sheetRows}
          courses={courses}
          kanbanBy={kanbanBy}
          setKanbanBy={setKanbanBy}
          onAddInColumn={(columnId, title) =>
            void addInKanbanColumn(columnId, title)
          }
          onDelete={(id) => void removeRow(id)}
          onRename={(id, title) => void patchAssignment({ id, title })}
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
                ids.map((id) => {
                  if (isAppSheetId(id) && kanbanBy === "class") {
                    return Promise.resolve();
                  }
                  if (isAppSheetId(id) && kanbanBy === "difficulty") {
                    return Promise.resolve();
                  }
                  return patchAssignment({ id, ...patch });
                }),
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
  applications,
  applicationsColor,
  courseMap,
  onStatus,
}: {
  assignments: Assignment[];
  applications: Application[];
  applicationsColor: string;
  courseMap: Map<string, Course>;
  onStatus: (id: string, status: AssignmentStatus) => void;
}) {
  const open = assignments
    .filter((a) => !isClosedAssignmentStatus(a.status) && a.dueAt)
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  const undated = assignments.filter(
    (a) => !isClosedAssignmentStatus(a.status) && !a.dueAt,
  );
  const appDeadlines = applications
    .filter((a) => a.deadline)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

  type AgendaItem =
    | { kind: "assignment"; sort: string; a: Assignment }
    | { kind: "application"; sort: string; app: Application };

  const merged: AgendaItem[] = [
    ...open.map((a) => ({
      kind: "assignment" as const,
      sort: String(a.dueAt),
      a,
    })),
    ...appDeadlines.map((app) => ({
      kind: "application" as const,
      sort: String(app.deadline),
      app,
    })),
  ].sort((x, y) => x.sort.localeCompare(y.sort));

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
      <h3 className="display text-xl">Upcoming</h3>
      <ul className="mt-4 space-y-2">
        {merged.map((item) => {
          if (item.kind === "application") {
            const app = item.app;
            return (
              <li
                key={`app-${app.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: applicationsColor }}
                    />
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white"
                      style={{ background: applicationsColor }}
                    >
                      {app.kind}
                    </span>
                    <span className="font-medium">
                      {app.url ? (
                        <a
                          href={normalizeApplicationUrl(app.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent)] hover:underline"
                        >
                          {app.title}
                        </a>
                      ) : (
                        app.title
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    Deadline {app.deadline} ·{" "}
                    {APPLICATION_STATUS_LABELS[app.status]} ·{" "}
                    <a href="/admin/applications" className="underline">
                      Applications
                    </a>
                  </div>
                </div>
              </li>
            );
          }
          const a = item.a;
          const c = a.courseId ? courseMap.get(a.courseId) : null;
          return (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2"
              style={{
                backgroundColor: c?.color
                  ? faintClassTint(c.color, 0.16)
                  : "rgba(255,255,255,0.7)",
              }}
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
        {!merged.length && (
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

  const cards = computeCourseProgress(courses, assignments);

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

/** Shift-range select, cmd/ctrl-click toggle, single-select fallback — shared by
 *  CalendarView and KanbanView, which both let you multi-select cards for a drag. */
function useMultiSelect() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  function selectCard(
    id: string,
    groupItems: { id: string }[],
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    const ids = groupItems.map((a) => a.id);
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

  return {
    selected,
    setSelected,
    lastSelected,
    setLastSelected,
    selectCard,
    idsToMove,
  };
}

function CalendarView({
  month,
  setMonth,
  weekAnchor,
  setWeekAnchor,
  calRange,
  setCalRange,
  weekStartsOn,
  setWeekStartsOn,
  assignments,
  applications,
  applicationsColor,
  courseMap,
  onMoveDay,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  weekAnchor: Date;
  setWeekAnchor: (d: Date) => void;
  calRange: CalRange;
  setCalRange: (r: CalRange) => void;
  weekStartsOn: WeekStart;
  setWeekStartsOn: (v: WeekStart) => void;
  assignments: Assignment[];
  applications: Application[];
  applicationsColor: string;
  courseMap: Map<string, Course>;
  onMoveDay: (ids: string[], dueAt: string) => void;
}) {
  const year = month.getFullYear();
  const mo = month.getMonth();
  const weekStart = startOfWeek(weekAnchor, weekStartsOn);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthCells = useMemo(() => {
    const first = new Date(year, mo, 1);
    const lead = (first.getDay() - weekStartsOn + 7) % 7;
    const daysInMonth = new Date(year, mo + 1, 0).getDate();
    const cells: (Date | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from(
        { length: daysInMonth },
        (_, i) => new Date(year, mo, i + 1),
      ),
    ];
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [year, mo, weekStartsOn]);

  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overYmd, setOverYmd] = useState<string | null>(null);
  const { selected, setSelected, selectCard, idsToMove } = useMultiSelect();

  const assignmentsByYmd = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!a.dueAt || isClosedAssignmentStatus(a.status)) continue;
      const p = dueDateParts(a.dueAt);
      if (!p) continue;
      const key = `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
      const list = map.get(key);
      if (list) list.push(a);
      else map.set(key, [a]);
    }
    return map;
  }, [assignments]);

  const appsByYmd = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const a of applications) {
      if (!a.deadline) continue;
      const list = map.get(a.deadline);
      if (list) list.push(a);
      else map.set(a.deadline, [a]);
    }
    return map;
  }, [applications]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelected]);

  function assignmentsForYmd(ymd: string) {
    return assignmentsByYmd.get(ymd) || [];
  }

  function appsForYmd(ymd: string) {
    return appsByYmd.get(ymd) || [];
  }

  function goToday() {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setWeekAnchor(startOfWeek(now, weekStartsOn));
  }

  function shiftRange(dir: -1 | 1) {
    if (calRange === "week") {
      setWeekAnchor(addDays(weekStart, dir * 7));
      const mid = addDays(weekStart, dir * 7 + 3);
      setMonth(new Date(mid.getFullYear(), mid.getMonth(), 1));
    } else {
      setMonth(new Date(year, mo + dir, 1));
    }
  }

  const title =
    calRange === "week"
      ? `${weekDays[0]!.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })} – ${weekDays[6]!.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`
      : month.toLocaleString("en-US", { month: "long", year: "numeric" });

  const todayYmd = toYmd(new Date());
  const labels = weekdayLabels(weekStartsOn);

  function renderDayCell(day: Date | null, key: string | number) {
    if (!day) {
      return (
        <div
          key={key}
          className={`bg-[var(--bg)]/40 ${
            calRange === "week" ? "min-h-[70vh]" : "min-h-[7.5rem] sm:min-h-[9rem]"
          }`}
        />
      );
    }
    const ymd = toYmd(day);
    const dayAssignments = assignmentsForYmd(ymd);
    const dayApps = appsForYmd(ymd);
    const isToday = ymd === todayYmd;
    const inMonth = day.getMonth() === mo;

    return (
      <div
        key={key}
        onDragOver={(e) => {
          e.preventDefault();
          setOverYmd(ymd);
        }}
        onDragLeave={() => setOverYmd((d) => (d === ymd ? null : d))}
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
          if (ids.length) onMoveDay(ids, ymd);
          setDragIds([]);
          setOverYmd(null);
          setSelected(new Set());
        }}
        className={`p-2 text-left ${
          calRange === "week"
            ? "min-h-[70vh]"
            : "min-h-[7.5rem] sm:min-h-[9rem]"
        } ${
          overYmd === ymd
            ? "bg-[var(--accent-soft)]"
            : isToday
              ? "bg-[var(--accent-soft)]/35"
              : "bg-[var(--bg)]"
        } ${calRange === "month" && !inMonth ? "opacity-40" : ""}`}
      >
        <div
          className={`text-sm font-medium ${
            isToday ? "text-[var(--accent)]" : "text-[var(--muted)]"
          }`}
        >
          {calRange === "week"
            ? day.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : day.getDate()}
        </div>
        <div className="mt-1 space-y-1">
          {dayAssignments.map((a) => {
            const c = a.courseId ? courseMap.get(a.courseId) : null;
            const isSel = selected.has(a.id);
            const isDragging = dragIds.includes(a.id);
            return (
              <div
                key={a.id}
                draggable
                onClick={(e) => selectCard(a.id, dayAssignments, e)}
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
                  setOverYmd(null);
                }}
                className={`cursor-grab truncate rounded px-1.5 py-1 text-[11px] active:cursor-grabbing ${
                  isDragging ? "opacity-40" : ""
                } ${isSel ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""}`}
                style={{
                  background: c?.color
                    ? faintClassTint(c.color, 0.28)
                    : faintClassTint("#0f766e", 0.2),
                  color: "var(--ink)",
                  boxShadow: c?.color
                    ? `inset 3px 0 0 ${c.color}`
                    : "inset 3px 0 0 var(--accent)",
                }}
                title={a.title}
              >
                {a.title}
                {isSel && selected.size > 1 && dragIds[0] === a.id
                  ? ` · ${selected.size}`
                  : ""}
              </div>
            );
          })}
          {dayApps.map((app) => (
            <a
              key={app.id}
              href="/admin/applications"
              className="block truncate rounded px-1.5 py-1 text-[11px] no-underline opacity-95 hover:opacity-100"
              style={{
                background: faintClassTint(applicationsColor, 0.28),
                color: "var(--ink)",
                boxShadow: `inset 3px 0 0 ${applicationsColor}`,
              }}
              title={`${app.kind}: ${app.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              {app.title}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="rounded-lg px-3 py-1 text-sm text-[var(--muted)] hover:bg-black/5"
            onClick={() => shiftRange(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] bg-white px-2.5 py-1 text-xs"
            onClick={goToday}
          >
            Today
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-1 text-sm text-[var(--muted)] hover:bg-black/5"
            onClick={() => shiftRange(1)}
          >
            →
          </button>
        </div>
        <h3 className="display text-center text-xl sm:text-2xl">{title}</h3>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {(
            [
              ["month", "Month"],
              ["week", "Week"],
            ] as [CalRange, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setCalRange(id);
                if (id === "week") {
                  setWeekAnchor(startOfWeek(new Date(year, mo, 15), weekStartsOn));
                }
              }}
              className={`rounded-full px-2.5 py-1 text-xs ${
                calRange === id
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white/80"
              }`}
            >
              {label}
            </button>
          ))}
          <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
            Start
            <select
              className="rounded-md border border-[var(--line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)]"
              value={weekStartsOn}
              onChange={(e) =>
                setWeekStartsOn(Number(e.target.value) as WeekStart)
              }
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </label>
        </div>
      </div>
      <p className="mb-3 text-center text-xs text-[var(--muted)]">
        Assignments drag to reschedule · Applications use the Applications group
        color (edit in Groups)
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
      {calRange === "month" && (
        <div className="grid grid-cols-7 gap-px text-center text-xs text-[var(--muted)]">
          {labels.map((d) => (
            <div key={d} className="py-2 font-medium">
              {d}
            </div>
          ))}
        </div>
      )}
      <div
        className={`grid gap-px bg-[var(--line)] ${
          calRange === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7"
        } ${calRange === "week" ? "min-h-[70vh]" : ""}`}
      >
        {calRange === "week"
          ? weekDays.map((d) => renderDayCell(d, toYmd(d)))
          : monthCells.map((d, i) => renderDayCell(d, i))}
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
  onAddInColumn,
  onDelete,
  onRename,
}: {
  assignments: Assignment[];
  courses: Course[];
  kanbanBy: KanbanBy;
  setKanbanBy: (v: KanbanBy) => void;
  onDropCards: (ids: string[], columnId: string) => void;
  onAddInColumn: (columnId: string, title: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [colText, setColText] = useState<Record<string, string>>({});
  const [colOrders, setColOrders] = useState<Record<string, string[]>>({});
  const [dragColId, setDragColId] = useState<string | null>(null);
  const { selected, setSelected, setLastSelected, selectCard, idsToMove } =
    useMultiSelect();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelected(new Set());
        setMenu(null);
        setEditId(null);
      }
    }
    function onClick() {
      setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [setSelected]);

  useEffect(() => {
    setSelected(new Set());
    setLastSelected(null);
  }, [kanbanBy, setSelected, setLastSelected]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings?slim=1");
      const json = await res.json();
      setColOrders(json.settings?.kanbanColumnOrder || {});
    })();
  }, []);

  const orderKey = `masterlist:${kanbanBy}`;

  async function saveColumnOrder(order: string[]) {
    setColOrders((prev) => ({ ...prev, [orderKey]: order }));
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kanbanColumnOrder: { [orderKey]: order } }),
    });
  }

  const columns = useMemo(() => {
    let cols: { id: string; label: string; color?: string; items: Assignment[] }[];
    if (kanbanBy === "status") {
      cols = ASSIGNMENT_STATUSES.map((s) => ({
        id: s,
        label: STATUS_LABEL[s],
        items: assignments.filter((a) => a.status === s),
      }));
    } else if (kanbanBy === "difficulty") {
      cols = ASSIGNMENT_DIFFICULTIES.map((d) => ({
        id: d,
        label: d,
        items: assignments.filter((a) => a.difficulty === d),
      }));
    } else {
      cols = courses.map((c) => ({
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
    }
    const order = applyColumnOrder(
      cols.map((c) => c.id),
      colOrders[orderKey],
    );
    return order.map((id) => cols.find((c) => c.id === id)!);
  }, [assignments, courses, kanbanBy, colOrders, orderKey]);

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
          Double-click to edit · right-click to delete · drag to move
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
              const draggedCol = e.dataTransfer.getData(KANBAN_COLUMN_DRAG_TYPE);
              if (draggedCol) {
                const next = reorderColumnIds(
                  columns.map((c) => c.id),
                  draggedCol,
                  col.id,
                );
                void saveColumnOrder(next);
                setDragColId(null);
                setOverCol(null);
                return;
              }
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
            } ${dragColId === col.id ? "opacity-50" : ""}`}
          >
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(KANBAN_COLUMN_DRAG_TYPE, col.id);
                e.dataTransfer.effectAllowed = "move";
                setDragColId(col.id);
              }}
              onDragEnd={() => {
                setDragColId(null);
                setOverCol(null);
              }}
              className="mb-2 flex cursor-grab items-center gap-1.5 text-xs font-medium active:cursor-grabbing sm:text-sm"
              title="Drag to reorder columns"
            >
              {"color" in col && col.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: String(col.color) }}
                />
              )}
              <span className="min-w-0 truncate">{col.label}</span>
              <span className="text-[var(--muted)]">({col.items.length})</span>
            </div>
            <input
              value={colText[col.id] || ""}
              onChange={(e) =>
                setColText((prev) => ({ ...prev, [col.id]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const t = colText[col.id] || "";
                  onAddInColumn(col.id, t);
                  setColText((prev) => ({ ...prev, [col.id]: "" }));
                }
              }}
              placeholder="+ Add"
              className="mb-2 w-full shrink-0 rounded-lg border border-dashed border-[var(--line)] bg-white/60 px-2 py-1 text-xs outline-none focus:border-[var(--accent)] sm:text-sm"
            />
            <div className={kanbanColumnBodyClass}>
              {col.items.map((a) => {
                const isSel = selected.has(a.id);
                const isDragging = dragIds.includes(a.id);
                const isEditing = editId === a.id;
                return (
                  <div
                    key={a.id}
                    draggable={!isEditing}
                    onClick={(e) => {
                      if (isEditing) return;
                      selectCard(a.id, col.items, e);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setMenu(null);
                      setEditId(a.id);
                      setEditText(a.title);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(new Set([a.id]));
                      setLastSelected(a.id);
                      setMenu({ id: a.id, x: e.clientX, y: e.clientY });
                    }}
                    onDragStart={(e) => {
                      if (isEditing) {
                        e.preventDefault();
                        return;
                      }
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
                        ? "border-[var(--accent)] ring-2 ring-[var(--accent)]"
                        : "border-[var(--line)]"
                    } ${
                      isSubmittedStyle(a.status)
                        ? "text-[var(--muted)] line-through opacity-70"
                        : ""
                    } ${isDragging ? "opacity-50" : ""}`}
                    style={{
                      backgroundColor: isSel
                        ? undefined
                        : (() => {
                            const hex = a.courseId
                              ? courses.find((c) => c.id === a.courseId)?.color
                              : null;
                            if (isSubmittedStyle(a.status)) {
                              return hex
                                ? faintClassTint(hex, 0.08)
                                : "rgb(245 245 244)";
                            }
                            return hex
                              ? faintClassTint(hex, 0.16)
                              : "rgba(255,255,255,0.9)";
                          })(),
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const t = editText.trim();
                              if (t && t !== a.title) onRename(a.id, t);
                              setEditId(null);
                            } else if (e.key === "Escape") {
                              setEditId(null);
                            }
                          }}
                          onBlur={() => {
                            const t = editText.trim();
                            if (t && t !== a.title) onRename(a.id, t);
                            setEditId(null);
                          }}
                          className="w-full rounded border border-[var(--accent)] bg-white px-1.5 py-0.5 text-xs font-medium sm:text-sm"
                        />
                      ) : (
                        <div className="text-xs font-medium leading-snug sm:text-sm">
                          {isAppSheetId(a.id) && (
                            <span className="mr-1 text-[10px] font-normal text-[var(--muted)] no-underline">
                              App
                            </span>
                          )}
                          {a.title}
                        </div>
                      )}
                      {isSel && selected.size > 1 && !isEditing && (
                        <span className="shrink-0 text-[10px] text-[var(--accent)]">
                          {selected.size}
                        </span>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="mt-0.5 text-[10px] text-[var(--muted)] no-underline sm:text-xs">
                        {a.dueAt ? formatDueDate(a.dueAt) : "No due date"}
                      </div>
                    )}
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
      {menu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-[var(--line)] bg-white py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--accent-soft)]"
            onClick={() => {
              const card = assignments.find((x) => x.id === menu.id);
              setEditId(menu.id);
              setEditText(card?.title || "");
              setMenu(null);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={() => {
              onDelete(menu.id);
              setMenu(null);
              setSelected((prev) => {
                const next = new Set(prev);
                next.delete(menu.id);
                return next;
              });
            }}
          >
            Delete
          </button>
        </div>
      )}
    </section>
  );
}
