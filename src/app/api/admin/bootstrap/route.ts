import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET() {
  const settings = await db.getSettings();
  const listItems = (await db.getListItems()).filter((i) => !i.checked);
  const reminders = await db.getReminders();
  const byList: Record<string, number> = {};
  for (const name of settings.listCatalog || []) {
    byList[name] = 0;
  }
  for (const i of listItems) {
    byList[i.listName] = (byList[i.listName] || 0) + 1;
  }
  return NextResponse.json({
    provider: db.dbProvider(),
    settings,
    lists: byList,
    reminderCount: reminders.length,
  });
}
