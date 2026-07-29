import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import {
  DEFAULT_THINKING_SHEET,
  normalizeThinkingSheet,
} from "@/lib/sheet-formulas";

export async function GET() {
  const settings = await db.getSettings();
  return NextResponse.json({
    sheet: normalizeThinkingSheet(settings.thinkingSheet || DEFAULT_THINKING_SHEET),
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const sheet = normalizeThinkingSheet(body.sheet || body);
  await db.updateSettings({ thinkingSheet: sheet });
  return NextResponse.json({ ok: true, sheet });
}
