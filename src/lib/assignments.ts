import * as db from "./db";
import type { Assignment } from "./types";
import { isClosedAssignmentStatus } from "./types";

export function statusLabel(status: Assignment["status"]): string {
  return status.replace(/_/g, " ");
}

export async function formatDueSummary(
  which: "today" | "tomorrow" | "week",
  timezone: string,
): Promise<string> {
  const assignments = await db.getAssignments();
  const courses = await db.getCourses();
  const byId = new Map(courses.map((c) => [c.id, c]));

  const wallNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const start = new Date(wallNow);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (which === "today") end.setDate(end.getDate() + 1);
  else if (which === "tomorrow") {
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 2);
  } else end.setDate(end.getDate() + 7);

  const startMs = start.getTime();
  const endMs = end.getTime();

  const items = assignments
    .filter((a) => {
      if (!a.dueAt || isClosedAssignmentStatus(a.status)) return false;
      const dueWall = new Date(
        new Date(a.dueAt).toLocaleString("en-US", { timeZone: timezone }),
      );
      const t = dueWall.getTime();
      return t >= startMs && t < endMs;
    })
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));

  if (!items.length) {
    return which === "week"
      ? "Nothing due in the next 7 days."
      : `Nothing due ${which}.`;
  }

  const lines = items.map((a, i) => {
    const course = a.courseId ? byId.get(a.courseId) : null;
    const when = a.dueAt
      ? new Date(a.dueAt).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
        })
      : "?";
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
