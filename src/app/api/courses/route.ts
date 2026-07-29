import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import type { CourseLink } from "@/lib/types";

function normalizeLinks(raw: unknown): CourseLink[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      let url = String(o.url || "").trim();
      if (!url) return null;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      return {
        label: String(o.label || "").trim() || "Link",
        url,
      };
    })
    .filter(Boolean) as CourseLink[];
}

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
    links?: CourseLink[];
    sortOrder?: number;
    action?: "delete";
  };
  if (body.action === "delete" && body.id) {
    try {
      await db.deleteCourse(body.id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Delete failed" },
        { status: 400 },
      );
    }
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
    links: normalizeLinks(body.links),
    sortOrder: body.sortOrder,
  });
  return NextResponse.json({ course });
}
