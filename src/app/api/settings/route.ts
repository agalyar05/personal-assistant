import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import type {
  AppSettings,
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
        taskHorizonDays: settings.taskHorizonDays,
        dueSoonBoldDays: settings.dueSoonBoldDays,
        kanbanColumnOrder: settings.kanbanColumnOrder,
        masterlistSheetSort: settings.masterlistSheetSort,
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
    taskHorizonDays?: number;
    dueSoonBoldDays?: number;
    liveHours?: number;
    endLive?: boolean;
    kanbanColumnOrder?: Record<string, string[]>;
    masterlistSheetSort?: AppSettings["masterlistSheetSort"];
    masterlistBackupDay?: string;
    masterlistBackupTime?: string;
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
  if (body.taskHorizonDays !== undefined) {
    patch.taskHorizonDays = Math.max(0, Math.min(365, Number(body.taskHorizonDays) || 0));
  } else {
    patch.taskHorizonDays = current.taskHorizonDays;
  }
  if (body.dueSoonBoldDays !== undefined) {
    patch.dueSoonBoldDays = Math.max(0, Math.min(365, Number(body.dueSoonBoldDays) || 0));
  } else {
    patch.dueSoonBoldDays = current.dueSoonBoldDays;
  }
  if (body.kanbanColumnOrder !== undefined) {
    patch.kanbanColumnOrder = body.kanbanColumnOrder;
  }
  if (body.masterlistSheetSort !== undefined) {
    patch.masterlistSheetSort = body.masterlistSheetSort;
  }
  if (body.masterlistBackupDay !== undefined) {
    patch.masterlistBackupDay = body.masterlistBackupDay;
  } else patch.masterlistBackupDay = current.masterlistBackupDay;
  if (body.masterlistBackupTime !== undefined) {
    patch.masterlistBackupTime = body.masterlistBackupTime;
  } else patch.masterlistBackupTime = current.masterlistBackupTime;

  const settings = await db.updateSettings(patch);
  return NextResponse.json({
    ok: true,
    settings: {
      timezone: settings.timezone,
      weatherCity: settings.weatherCity,
      morningBriefingTime: settings.morningBriefingTime,
      uiTheme: settings.uiTheme,
      cronControl: settings.cronControl,
      taskHorizonDays: settings.taskHorizonDays,
      dueSoonBoldDays: settings.dueSoonBoldDays,
      kanbanColumnOrder: settings.kanbanColumnOrder,
      masterlistSheetSort: settings.masterlistSheetSort,
      masterlistBackupDay: settings.masterlistBackupDay,
      masterlistBackupTime: settings.masterlistBackupTime,
      lastMasterlistBackup: settings.lastMasterlistBackup,
      masterlistBackupSheetUrl: settings.masterlistBackupSheetUrl,
    },
  });
}
