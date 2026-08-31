import { NextResponse } from "next/server";
import { backupMasterlistNow } from "@/lib/masterlist-backup";

export async function POST() {
  try {
    const { url } = await backupMasterlistNow();
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
