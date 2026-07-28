export type CronMode = "off" | "always" | "window";

export type CronControlSettings = {
  mode: CronMode;
  timezone: string;
  windowStart: string; // "HH:MM"
  windowEnd: string; // "HH:MM" (exclusive end-of-day use "24:00")
  daysOfWeek: number[]; // 0=Sun … 6=Sat
  liveUntil: string | null;
};

export type AppSettings = {
  timezone: string;
  weatherCity: string;
  morningBriefingTime: string; // "HH:MM"
  weeklyBriefingDay: string; // "sunday"
  weeklyBriefingTime: string;
  lastMorningBriefing: string | null; // YYYY-MM-DD
  lastWeeklyBriefing: string | null; // YYYY-Www
  googleVoiceReply: string | null;
  cronControl: CronControlSettings;
};

export type ListItem = {
  id: string;
  listName: string;
  text: string;
  checked: boolean;
  sortOrder: number;
  createdAt: string;
};

export type ReminderFrequency = "once" | "daily" | "weekdays" | string; // weekly:MO etc.

export type Reminder = {
  id: string;
  message: string;
  remindAt: string | null; // local ISO for one-off
  frequency: ReminderFrequency;
  fireTime: string | null; // HH:MM for recurring
  lastSent: string | null; // YYYY-MM-DD
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
};

export const DEFAULT_STORE: Store = {
  settings: DEFAULT_SETTINGS,
  listItems: [],
  reminders: [],
  processedMessages: [],
};
