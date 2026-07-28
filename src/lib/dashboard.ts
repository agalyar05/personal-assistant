import type { DashboardLayout, DashboardWidget, DashboardWidgetType } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export const WIDGET_CATALOG: {
  type: DashboardWidgetType;
  label: string;
  hint: string;
  defaultSpan: 1 | 2 | 3;
}[] = [
  {
    type: "welcome",
    label: "Welcome",
    hint: "Greeting + editable blurb",
    defaultSpan: 3,
  },
  {
    type: "status",
    label: "Status",
    hint: "Storage, timezone, cron, lists",
    defaultSpan: 2,
  },
  {
    type: "sync",
    label: "Sync",
    hint: "Inbox sync button",
    defaultSpan: 1,
  },
  {
    type: "due_soon",
    label: "Due soon",
    hint: "Upcoming assignments",
    defaultSpan: 2,
  },
  {
    type: "todo",
    label: ".todo",
    hint: "Open todos preview",
    defaultSpan: 1,
  },
  {
    type: "progress",
    label: "Class progress",
    hint: "Course completion bars",
    defaultSpan: 2,
  },
  {
    type: "notes",
    label: "Text box",
    hint: "Sticky note you can edit",
    defaultSpan: 1,
  },
  {
    type: "image",
    label: "Image",
    hint: "URL or upload a picture",
    defaultSpan: 1,
  },
  {
    type: "shortcuts",
    label: "Text shortcuts",
    hint: "SMS command cheatsheet",
    defaultSpan: 3,
  },
];

export function defaultDashboardLayout(): DashboardLayout {
  return structuredClone(DEFAULT_SETTINGS.dashboardLayout);
}

export function normalizeDashboardLayout(
  raw: DashboardLayout | null | undefined,
): DashboardLayout {
  if (!raw?.widgets?.length) return defaultDashboardLayout();
  const widgets = raw.widgets
    .filter((w) => w && w.id && w.type)
    .map((w) => ({
      ...w,
      span: ([1, 2, 3].includes(w.span) ? w.span : 1) as 1 | 2 | 3,
    }));
  return widgets.length ? { widgets } : defaultDashboardLayout();
}

export function newWidget(type: DashboardWidgetType): DashboardWidget {
  const meta = WIDGET_CATALOG.find((c) => c.type === type)!;
  const id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
  if (type === "welcome") {
    return {
      id,
      type,
      span: meta.defaultSpan,
      title: "Welcome back",
      text: "Customize this board — add widgets, drag to rearrange.",
    };
  }
  if (type === "notes") {
    return {
      id,
      type,
      span: meta.defaultSpan,
      title: "Notes",
      text: "Write something…",
      accent: "#0f766e",
    };
  }
  if (type === "image") {
    return {
      id,
      type,
      span: meta.defaultSpan,
      title: "Image",
      imageUrl: "",
      accent: "#c2410c",
    };
  }
  return { id, type, span: meta.defaultSpan };
}

export function spanClass(span: 1 | 2 | 3): string {
  if (span === 3) return "sm:col-span-2 lg:col-span-3";
  if (span === 2) return "sm:col-span-2 lg:col-span-2";
  return "sm:col-span-1 lg:col-span-1";
}
