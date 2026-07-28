import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET() {
  const courses = await db.getCourses();
  return NextResponse.json({ courses });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    name?: string;
    code?: string;
    color?: string;
    professor?: string;
    schedule?: string;
    sortOrder?: number;
    action?: "delete";
  };
  if (body.action === "delete" && body.id) {
    await db.deleteCourse(body.id);
    return NextResponse.json({ ok: true });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const course = await db.upsertCourse({
    id: body.id,
    name: body.name.trim(),
    code: body.code,
    color: body.color,
    professor: body.professor,
    schedule: body.schedule,
    sortOrder: body.sortOrder,
  });
  return NextResponse.json({ course });
}
