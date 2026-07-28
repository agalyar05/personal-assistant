import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { listRemindersParts } from "@/lib/reminders";

export async function GET() {
  const reminders = await db.getReminders();
  return NextResponse.json({ reminders, preview: await listRemindersParts() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    message?: string;
    remindAt?: string;
    frequency?: string;
    fireTime?: string;
  };
  if (!body.message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  const row = await db.addReminder({
    message: body.message,
    remindAt: body.remindAt || null,
    frequency: (body.frequency as "once") || "once",
    fireTime: body.fireTime || null,
  });
  return NextResponse.json({ reminder: row });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get("q") || "";
  const n = await db.deleteRemindersMatching(search);
  return NextResponse.json({ cancelled: n });
}
