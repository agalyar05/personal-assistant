import { NextResponse } from "next/server";
import * as db from "@/lib/db";
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
    await db.deleteAssignment(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "bulk" && Array.isArray(body.rows)) {
    const assignments = await db.bulkUpsertAssignments(
      body.rows as (Partial<Assignment> & { title?: string; id?: string })[],
    );
    return NextResponse.json({ assignments });
  }

  const id = typeof body.id === "string" ? body.id : undefined;
  if (!id && !(typeof body.title === "string" && body.title.trim())) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  // Only forward fields that were actually sent — never coerce undefined → null
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

  const assignment = await db.upsertAssignment(patch);
  return NextResponse.json({ assignment });
}
