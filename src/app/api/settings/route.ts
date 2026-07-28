import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import type {
  CronControlSettings,
  DashboardLayout,
  UiThemeSettings,
} from "@/lib/types";

/** Strip huge data-URL images from API responses so theme/nav stays fast. */
function slimDashboardLayout(layout: DashboardLayout | undefined): DashboardLayout | undefined {
  if (!layout?.widgets) return layout;
  return {
    widgets: layout.widgets.map((w) => {
      if (w.imageUrl && w.imageUrl.startsWith("data:") && w.imageUrl.length > 8_000) {
        return {
          ...w,
          imageUrl: "",
          text: w.text || "(image omitted from sync — use a URL under ~1MB instead)",
        };
      }
      return w;
    }),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slim = url.searchParams.get("slim") === "1";
  const settings = await db.getSettings();
  if (slim) {
    return NextResponse.json({
      settings: {
        timezone: settings.timezone,
        uiTheme: settings.uiTheme,
        cronControl: settings.cronControl,
      },
      provider: db.dbProvider(),
    });
  }
  return NextResponse.json({
    settings: {
      ...settings,
      dashboardLayout:
        slimDashboardLayout(settings.dashboardLayout) ?? settings.dashboardLayout,
    },
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
    dashboardLayout?: DashboardLayout;
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

  let dashboardLayout = body.dashboardLayout ?? current.dashboardLayout;
  if (body.dashboardLayout) {
    dashboardLayout =
      slimDashboardLayout(body.dashboardLayout) ?? body.dashboardLayout;
  }

  const patch: Parameters<typeof db.updateSettings>[0] = { cronControl };
  if (body.timezone !== undefined) patch.timezone = body.timezone;
  else patch.timezone = current.timezone;
  if (body.weatherCity !== undefined) patch.weatherCity = body.weatherCity;
  else patch.weatherCity = current.weatherCity;
  if (body.morningBriefingTime !== undefined) {
    patch.morningBriefingTime = body.morningBriefingTime;
  } else patch.morningBriefingTime = current.morningBriefingTime;
  if (body.weeklyBriefingDay !== undefined) {
    patch.weeklyBriefingDay = body.weeklyBriefingDay;
  } else patch.weeklyBriefingDay = current.weeklyBriefingDay;
  if (body.weeklyBriefingTime !== undefined) {
    patch.weeklyBriefingTime = body.weeklyBriefingTime;
  } else patch.weeklyBriefingTime = current.weeklyBriefingTime;
  if (body.uiTheme !== undefined) patch.uiTheme = body.uiTheme;
  else patch.uiTheme = current.uiTheme;
  if (body.dashboardLayout !== undefined) patch.dashboardLayout = dashboardLayout;
  else patch.dashboardLayout = current.dashboardLayout;

  const settings = await db.updateSettings(patch);
  // Don't echo giant payloads back — client already has the state
  return NextResponse.json({
    ok: true,
    settings: {
      timezone: settings.timezone,
      uiTheme: settings.uiTheme,
      cronControl: settings.cronControl,
    },
  });
}
