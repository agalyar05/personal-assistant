import { NextResponse } from "next/server";
import { runPollCycle } from "@/lib/poll";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runPollCycle({ force: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
