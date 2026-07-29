import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import {
  applicationReminderMessage,
  normalizeApplicationUrl,
} from "@/lib/applications";
import type { Application, ApplicationKind, ApplicationStatus } from "@/lib/types";

async function syncApplicationReminder(
  app: Application,
): Promise<Application> {
  // Clear old linked reminder if remindAt cleared or changed
  if (app.reminderId && !app.remindAt) {
    await db.deleteReminder(app.reminderId);
    return db.upsertApplication({
      id: app.id,
      title: app.title,
      reminderId: null,
    });
  }
  if (!app.remindAt) return app;

  const message = applicationReminderMessage(app);

  if (app.reminderId) {
    const updated = await db.updateReminder(app.reminderId, {
      message,
      remindAt: app.remindAt,
      frequency: "once",
      fireTime: null,
      sent: false,
    });
    if (updated) return app;
  }

  const reminder = await db.addReminder({
    message,
    remindAt: app.remindAt,
    frequency: "once",
    fireTime: null,
  });
  return db.upsertApplication({
    id: app.id,
    title: app.title,
    reminderId: reminder.id,
  });
}

export async function GET() {
  try {
    const applications = await db.getApplications();
    return NextResponse.json({ applications });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load applications";
    console.error("applications GET", e);
    return NextResponse.json({ error: message, applications: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Application> & {
      action?: "delete";
      id?: string;
      title?: string;
    };

    if (body.action === "delete" && body.id) {
      await db.deleteApplication(body.id);
      return NextResponse.json({ ok: true });
    }

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const patch: Partial<Application> & { title: string } = {
      title: body.title.trim(),
    };
    if (body.id) patch.id = body.id;
    if ("kind" in body) patch.kind = body.kind as ApplicationKind;
    if ("status" in body) patch.status = body.status as ApplicationStatus;
    if ("url" in body) {
      patch.url = normalizeApplicationUrl(String(body.url || ""));
    }
    if ("description" in body) {
      patch.description = String(body.description || "");
    }
    if ("deadline" in body) {
      patch.deadline = body.deadline
        ? String(body.deadline).slice(0, 10)
        : null;
    }
    if ("remindAt" in body) {
      patch.remindAt = body.remindAt ? String(body.remindAt) : null;
    }
    if ("notes" in body) patch.notes = String(body.notes || "");
    if ("sortOrder" in body) patch.sortOrder = Number(body.sortOrder || 0);

    let app = await db.upsertApplication(patch);

    try {
      if (
        "remindAt" in body ||
        "title" in body ||
        "url" in body ||
        "description" in body ||
        "deadline" in body ||
        "kind" in body
      ) {
        const all = await db.getApplications();
        const fresh = all.find((a) => a.id === app.id) || app;
        app = await syncApplicationReminder(fresh);
      }
    } catch (remindErr) {
      // App is saved; reminder sync is best-effort
      console.error("application reminder sync failed", remindErr);
    }

    const applications = await db.getApplications();
    return NextResponse.json({ application: app, applications });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    console.error("applications POST", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
