export type CronMode = "off" | "always" | "window";

export type CronControlSettings = {
  mode: CronMode;
  timezone: string;
  windowStart: string;
  windowEnd: string;
  daysOfWeek: number[];
  liveUntil: string | null;
};

export type ThemeId = "harbor" | "meadow" | "sunset" | "slate" | "custom";

export type ThemeColors = {
  bg: string;
  ink: string;
  muted: string;
  card: string;
  accent: string;
  accentSoft: string;
  line: string;
};

export type UiThemeSettings = {
  id: ThemeId;
  custom: ThemeColors;
};

export type DashboardWidgetType =
  | "welcome"
  | "status"
  | "shortcuts"
  | "notes"
  | "image"
  | "todo"
  | "due_soon"
  | "progress"
  | "sync";

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  /** Grid span: 1 = narrow, 2 = half-ish, 3 = full */
  span: 1 | 2 | 3;
  title?: string;
  /** Freeform text (welcome subtitle / notes body) */
  text?: string;
  /** Image URL or data URL */
  imageUrl?: string;
  /** Accent strip color for notes/image */
  accent?: string;
};

export type DashboardLayout = {
  widgets: DashboardWidget[];
};

export type ThinkingSheetData = {
  colCount: number;
  rowCount: number;
  cells: Record<string, string>;
};

export type AppSettings = {
  timezone: string;
  weatherCity: string;
  morningBriefingTime: string;
  weeklyBriefingDay: string;
  weeklyBriefingTime: string;
  lastMorningBriefing: string | null;
  lastWeeklyBriefing: string | null;
  googleVoiceReply: string | null;
  cronControl: CronControlSettings;
  uiTheme: UiThemeSettings;
  listCatalog: string[];
  dashboardLayout: DashboardLayout;
  thinkingSheet: ThinkingSheetData;
  /** Show tasks due within this many days (overdue + undated always). 0 = all. Calendar ignores this. */
  taskHorizonDays: number;
  /** Bold a task if it's overdue, due today, or due within this many days. */
  dueSoonBoldDays: number;
  /** Reminder text waiting for a time from the user (SMS follow-up). */
  pendingReminderMessage: string | null;
  /** User-dragged Kanban column order, keyed "todo" or "masterlist:<status|difficulty|class>". */
  kanbanColumnOrder: Record<string, string[]>;
  /** Masterlist Sheet view's persistent sort, or null for manual (drag) order. */
  masterlistSheetSort: {
    key: "title" | "courseId" | "dueAt" | "status";
    dir: "asc" | "desc";
  } | null;
  /** Weekly Masterlist -> Google Sheets backup. Day is a lowercase weekday
   * name (sunday..saturday); time is HH:MM 24h local. */
  masterlistBackupDay: string;
  masterlistBackupTime: string;
  lastMasterlistBackup: string | null;
  /** Spreadsheet the backup writes to — created automatically on first run. */
  masterlistBackupSheetId: string | null;
  masterlistBackupSheetUrl: string | null;
};

export type AssignmentStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "submitted"
  | "n_a";

export type AssignmentDifficulty = "easy" | "medium" | "hard";

export type CourseLink = {
  label: string;
  url: string;
};

export type Course = {
  id: string;
  name: string;
  code: string;
  color: string;
  professor: string;
  schedule: string;
  links: CourseLink[];
  sortOrder: number;
  createdAt: string;
};

export type Assignment = {
  id: string;
  courseId: string | null;
  title: string;
  status: AssignmentStatus;
  dueAt: string | null;
  assignmentType: string;
  difficulty: AssignmentDifficulty;
  pointsEarned: number | null;
  pointsPossible: number | null;
  notes: string;
  link: string;
  sortOrder: number;
  dueReminderSentFor: string | null;
  /** Linked .todo list_items.id when added to .todo from Masterlist */
  todoItemId: string | null;
  createdAt: string;
};

export type ListDifficulty = "unassigned" | "easy" | "medium" | "hard";

export type ListItem = {
  id: string;
  listName: string;
  text: string;
  checked: boolean;
  difficulty: ListDifficulty;
  sortOrder: number;
  createdAt: string;
};

export type ReminderFrequency = "once" | "daily" | "weekdays" | string;

export type Reminder = {
  id: string;
  message: string;
  remindAt: string | null;
  frequency: ReminderFrequency;
  fireTime: string | null;
  lastSent: string | null;
  snoozedUntil: string | null;
  sent: boolean;
  createdAt: string;
};

export type ApplicationKind =
  | "scholarship"
  | "job"
  | "internship"
  | "program"
  | "grant"
  | "other";

export type ApplicationStatus =
  | "idea"
  | "researching"
  | "in_progress"
  | "submitted"
  | "interview"
  | "accepted"
  | "rejected"
  | "withdrawn";

export type Application = {
  id: string;
  title: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  url: string;
  description: string;
  deadline: string | null;
  remindAt: string | null;
  reminderId: string | null;
  notes: string;
  sortOrder: number;
  createdAt: string;
};

export type ProcessedMessage = {
  gmailMessageId: string;
  threadId: string;
  processedAt: string;
};

export type Store = {
  settings: AppSettings;
  listItems: ListItem[];
  reminders: Reminder[];
  processedMessages: ProcessedMessage[];
  courses: Course[];
  assignments: Assignment[];
  applications: Application[];
};

export const DEFAULT_THEME_CUSTOM: ThemeColors = {
  bg: "#f3efe6",
  ink: "#1c1917",
  muted: "#78716c",
  card: "#fffcf7",
  accent: "#0f766e",
  accentSoft: "#ccfbf1",
  line: "#e7e0d5",
};

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: "America/Detroit",
  weatherCity: "Detroit",
  morningBriefingTime: "08:00",
  weeklyBriefingDay: "sunday",
  weeklyBriefingTime: "20:00",
  lastMorningBriefing: null,
  lastWeeklyBriefing: null,
  googleVoiceReply: null,
  cronControl: {
    mode: "window",
    timezone: "America/Detroit",
    windowStart: "07:00",
    windowEnd: "24:00",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    liveUntil: null,
  },
  uiTheme: {
    id: "harbor",
    custom: { ...DEFAULT_THEME_CUSTOM },
  },
  listCatalog: ["todo", "groceries", "notes", "bhangra"],
  dashboardLayout: {
    widgets: [
      {
        id: "welcome",
        type: "welcome",
        span: 3,
        title: "Welcome back",
        text: "Your SMS assistant dashboard — drag widgets, add notes, make it yours.",
      },
      { id: "status", type: "status", span: 2 },
      { id: "sync", type: "sync", span: 1 },
      { id: "due_soon", type: "due_soon", span: 2 },
      { id: "todo", type: "todo", span: 1 },
      { id: "shortcuts", type: "shortcuts", span: 3 },
    ],
  },
  thinkingSheet: {
    colCount: 12,
    rowCount: 30,
    cells: {},
  },
  taskHorizonDays: 7,
  dueSoonBoldDays: 1,
  pendingReminderMessage: null,
  kanbanColumnOrder: {},
  masterlistSheetSort: null,
  masterlistBackupDay: "sunday",
  masterlistBackupTime: "03:00",
  lastMasterlistBackup: null,
  masterlistBackupSheetId: null,
  masterlistBackupSheetUrl: null,
};

export const DEFAULT_STORE: Store = {
  settings: DEFAULT_SETTINGS,
  listItems: [],
  reminders: [],
  processedMessages: [],
  courses: [],
  assignments: [],
  applications: [],
};

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "not_started",
  "in_progress",
  "complete",
  "submitted",
  "n_a",
];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  submitted: "Submitted",
  n_a: "N/A",
};

/** Hide from agenda / due / active calendar. */
export function isClosedAssignmentStatus(status: AssignmentStatus): boolean {
  return status === "complete" || status === "submitted" || status === "n_a";
}

export function isSubmittedStyle(status: AssignmentStatus): boolean {
  return status === "submitted";
}

export const ASSIGNMENT_DIFFICULTIES: AssignmentDifficulty[] = [
  "easy",
  "medium",
  "hard",
];

// Application labels live in application-meta.ts
