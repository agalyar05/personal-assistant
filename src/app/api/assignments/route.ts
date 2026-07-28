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
  const body = (await req.json()) as {
    action?: "delete" | "bulk";
    id?: string;
    rows?: (Partial<Assignment> & { title: string })[];
    title?: string;
    courseId?: string | null;
    status?: AssignmentStatus;
    dueAt?: string | null;
    assignmentType?: string;
    difficulty?: AssignmentDifficulty;
    pointsEarned?: number | null;
    pointsPossible?: number | null;
    notes?: string;
    sortOrder?: number;
  };

  if (body.action === "delete" && body.id) {
    await db.deleteAssignment(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "bulk" && Array.isArray(body.rows)) {
    const assignments = await db.bulkUpsertAssignments(body.rows);
    return NextResponse.json({ assignments });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const assignment = await db.upsertAssignment({
    id: body.id,
    title: body.title.trim(),
    courseId: body.courseId ?? null,
    status: body.status,
    dueAt: body.dueAt ?? null,
    assignmentType: body.assignmentType,
    difficulty: body.difficulty,
    pointsEarned: body.pointsEarned,
    pointsPossible: body.pointsPossible,
    notes: body.notes,
    sortOrder: body.sortOrder,
  });
  return NextResponse.json({ assignment });
}
