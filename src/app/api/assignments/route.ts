import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import {
  setAssignmentOnTodo,
  syncTodoFromAssignmentStatus,
} from "@/lib/masterlist-todo";
import type { Assignment, AssignmentDifficulty, AssignmentStatus } from "@/lib/types";

export async function GET() {
  const [assignments, courses] = await Promise.all([
    db.getAssignments(),
    db.getCourses(),
  ]);
  return NextResponse.json({ assignments, courses });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;

  if (body.action === "delete" && typeof body.id === "string") {
    const all = await db.getAssignments();
    const existing = all.find((a) => a.id === body.id);
    if (existing?.todoItemId) {
      try {
        await db.deleteListItem(existing.todoItemId);
      } catch {
        /* ignore */
      }
    }
    await db.deleteAssignment(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "todo" && typeof body.id === "string") {
    const all = await db.getAssignments();
    const existing = all.find((a) => a.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const assignment = await setAssignmentOnTodo(
      existing,
      Boolean(body.onTodo),
    );
    return NextResponse.json({ assignment });
  }

  if (body.action === "bulk" && Array.isArray(body.rows)) {
    const rows = body.rows as (Partial<Assignment> & {
      title?: string;
      id?: string;
    })[];
    // Same .todo mirroring as the single-row patch below, for rows whose
    // patch actually touches status (fill-down, bulk status edits) — most
    // bulk calls are pure reorders with no status field, so this is a
    // cheap no-op for those.
    const statusChanges = rows.filter((r) => r.id && "status" in r);
    const beforeById = statusChanges.length
      ? new Map((await db.getAssignments()).map((a) => [a.id, a]))
      : new Map<string, Assignment>();

    const assignments = await db.bulkUpsertAssignments(rows);

    for (const r of statusChanges) {
      const prev = beforeById.get(r.id!);
      const updated = assignments.find((a) => a.id === r.id);
      if (updated?.todoItemId && prev?.status !== r.status) {
        await syncTodoFromAssignmentStatus(updated, r.status as AssignmentStatus);
      }
    }
    return NextResponse.json({ assignments });
  }

  const id = typeof body.id === "string" ? body.id : undefined;
  if (!id && !(typeof body.title === "string" && body.title.trim())) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const patch: Partial<Assignment> & { id?: string; title?: string } = {};
  if (id) patch.id = id;
  if ("title" in body && typeof body.title === "string") {
    patch.title = body.title.trim() || "Untitled";
  }
  if ("courseId" in body) {
    patch.courseId =
      body.courseId == null || body.courseId === ""
        ? null
        : String(body.courseId);
  }
  if ("status" in body) patch.status = body.status as AssignmentStatus;
  if ("dueAt" in body) {
    patch.dueAt =
      body.dueAt == null || body.dueAt === "" ? null : String(body.dueAt);
  }
  if ("assignmentType" in body) {
    patch.assignmentType = String(body.assignmentType ?? "");
  }
  if ("difficulty" in body) {
    patch.difficulty = body.difficulty as AssignmentDifficulty;
  }
  if ("pointsEarned" in body) {
    patch.pointsEarned =
      body.pointsEarned == null || body.pointsEarned === ""
        ? null
        : Number(body.pointsEarned);
  }
  if ("pointsPossible" in body) {
    patch.pointsPossible =
      body.pointsPossible == null || body.pointsPossible === ""
        ? null
        : Number(body.pointsPossible);
  }
  if ("notes" in body) patch.notes = String(body.notes ?? "");
  if ("link" in body) patch.link = String(body.link ?? "");
  if ("sortOrder" in body) patch.sortOrder = Number(body.sortOrder ?? 0);
  if ("todoItemId" in body) {
    patch.todoItemId =
      body.todoItemId == null || body.todoItemId === ""
        ? null
        : String(body.todoItemId);
  }

  const before = id
    ? (await db.getAssignments()).find((a) => a.id === id)
    : null;
  const assignment = await db.upsertAssignment(patch);
  if (
    patch.status !== undefined &&
    assignment.todoItemId &&
    before?.status !== patch.status
  ) {
    await syncTodoFromAssignmentStatus(assignment, patch.status);
  }
  if (
    patch.title !== undefined &&
    assignment.todoItemId &&
    before?.title !== patch.title
  ) {
    await db.updateListItem(assignment.todoItemId, {
      text: assignment.title,
    });
  }
  return NextResponse.json({ assignment });
}
