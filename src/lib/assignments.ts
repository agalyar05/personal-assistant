import * as db from "./db";
import { formatDueDate, toInputDate } from "./fill";
import type { Assignment } from "./types";
import { isClosedAssignmentStatus } from "./types";

export function statusLabel(status: Assignment["status"]): string {
  return status.replace(/_/g, " ");
}

function ymdInTimezone(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}

function assignmentDueYmd(dueAt: string, timezone: string): string | null {
  const trimmed = dueAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dateOnly = toInputDate(trimmed);
  if (dateOnly && !trimmed.includes("T") && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return dateOnly;
  }
  try {
    return ymdInTimezone(new Date(dueAt), timezone);
  } catch {
    return dateOnly || null;
  }
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + days, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export async function formatDueSummary(
  which: "today" | "tomorrow" | "week",
  timezone: string,
): Promise<string> {
  const assignments = await db.getAssignments();
  const courses = await db.getCourses();
  const byId = new Map(courses.map((c) => [c.id, c]));

  const todayYmd = ymdInTimezone(new Date(), timezone);
  let startStr = todayYmd;
  let endStr = addDaysYmd(todayYmd, 1);
  if (which === "tomorrow") {
    startStr = addDaysYmd(todayYmd, 1);
    endStr = addDaysYmd(todayYmd, 2);
  } else if (which === "week") {
    endStr = addDaysYmd(todayYmd, 7);
  }

  const items = assignments
    .filter((a) => {
      if (!a.dueAt || isClosedAssignmentStatus(a.status)) return false;
      const ymd = assignmentDueYmd(a.dueAt, timezone);
      if (!ymd) return false;
      return ymd >= startStr && ymd < endStr;
    })
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));

  if (!items.length) {
    return which === "week"
      ? "Nothing due in the next 7 days."
      : `Nothing due ${which}.`;
  }

  const lines = items.map((a, i) => {
    const course = a.courseId ? byId.get(a.courseId) : null;
    const when = formatDueDate(a.dueAt) || "?";
    const cls = course?.code || course?.name || "General";
    return `${i + 1}. ${cls}: ${a.title} — ${when}`;
  });
  const header =
    which === "today"
      ? "Due today:"
      : which === "tomorrow"
        ? "Due tomorrow:"
        : "Due this week:";
  return [header, ...lines].join("\n");
}

export function courseProgress(courseId: string, assignments: Assignment[]) {
  const mine = assignments.filter((a) => a.courseId === courseId);
  const done = mine.filter(
    (a) => a.status === "complete" || a.status === "submitted",
  ).length;
  return { total: mine.length, completed: done };
}
