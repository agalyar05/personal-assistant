import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import type { CronControlSettings, UiThemeSettings } from "@/lib/types";

export async function GET() {
  const settings = await db.getSettings();
  return NextResponse.json({
    settings,
    provider: db.dbProvider(),
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    timezone?: string;
    weatherCity?: string;
    morningBriefingTime?: string;
    weeklyBriefingDay?: string;
    weeklyBriefingTime?: string;
    cronControl?: Partial<CronControlSettings>;
    uiTheme?: UiThemeSettings;
    liveHours?: number;
    endLive?: boolean;
  };
  const current = await db.getSettings();
  let cronControl = { ...current.cronControl, ...(body.cronControl || {}) };
  if (body.liveHours && body.liveHours > 0) {
    cronControl = {
      ...cronControl,
      liveUntil: new Date(Date.now() + body.liveHours * 3600_000).toISOString(),
    };
  }
  if (body.endLive) {
    cronControl = { ...cronControl, liveUntil: null };
  }
  const settings = await db.updateSettings({
    timezone: body.timezone ?? current.timezone,
    weatherCity: body.weatherCity ?? current.weatherCity,
    morningBriefingTime:
      body.morningBriefingTime ?? current.morningBriefingTime,
    weeklyBriefingDay: body.weeklyBriefingDay ?? current.weeklyBriefingDay,
    weeklyBriefingTime: body.weeklyBriefingTime ?? current.weeklyBriefingTime,
    cronControl,
    uiTheme: body.uiTheme ?? current.uiTheme,
  });
  return NextResponse.json({ settings });
}
