import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { isClosedAssignmentStatus } from "@/lib/types";

export async function GET() {
  const settings = await db.getSettings();
  const listItems = await db.getListItems();
  const openLists = listItems.filter((i) => !i.checked);
  const reminders = await db.getReminders();
  const courses = await db.getCourses();
  const assignments = await db.getAssignments();
  const byList: Record<string, number> = {};
  for (const name of settings.listCatalog || []) {
    byList[name] = 0;
  }
  for (const i of openLists) {
    byList[i.listName] = (byList[i.listName] || 0) + 1;
  }
  const dueSoon = assignments
    .filter((a) => !isClosedAssignmentStatus(a.status) && a.dueAt)
    .sort(
      (a, b) =>
        new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime(),
    )
    .slice(0, 8);
  const todos = listItems
    .filter((i) => i.listName === "todo" && !i.checked)
    .slice(0, 12);
  return NextResponse.json({
    provider: db.dbProvider(),
    settings,
    lists: byList,
    reminderCount: reminders.length,
    courses,
    dueSoon,
    todos,
    assignments,
  });
}
