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
};

export type AssignmentStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "complete";

export type AssignmentDifficulty = "easy" | "medium" | "hard";

export type Course = {
  id: string;
  name: string;
  code: string;
  color: string;
  professor: string;
  schedule: string;
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
  sortOrder: number;
  dueReminderSentFor: string | null;
  createdAt: string;
};

export type ListItem = {
  id: string;
  listName: string;
  text: string;
  checked: boolean;
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
};

export const DEFAULT_STORE: Store = {
  settings: DEFAULT_SETTINGS,
  listItems: [],
  reminders: [],
  processedMessages: [],
  courses: [],
  assignments: [],
};

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "not_started",
  "in_progress",
  "submitted",
  "complete",
];

export const ASSIGNMENT_DIFFICULTIES: AssignmentDifficulty[] = [
  "easy",
  "medium",
  "hard",
];
