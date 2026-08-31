import * as db from "./db";
import { sheets } from "./sms/gmail";
import { ymdInTimezone } from "./zoned-time";
import type { AppSettings } from "./types";

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const SHEET_TITLE = "Masterlist";
const HEADERS = [
  "Title",
  "Class",
  "Status",
  "Due",
  "Type",
  "Difficulty",
  "Earned",
  "Possible",
  "Notes",
  "Link",
];

function isBackupDue(settings: AppSettings, now: Date, tz: string): boolean {
  const today = ymdInTimezone(now, tz);
  if (settings.lastMasterlistBackup === today) return false;
  const day = (settings.masterlistBackupDay || "sunday").toLowerCase();
  const [y, mo, d] = today.split("-").map(Number);
  const weekday = new Date(y!, mo! - 1, d!, 12, 0, 0).getDay();
  if (WEEKDAY_NAMES[weekday] !== day) return false;
  const [hRaw, mRaw] = (settings.masterlistBackupTime || "03:00").split(":");
  const scheduledMinutes = (Number(hRaw) || 0) * 60 + (Number(mRaw) || 0);
  const nowLocal = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
  return nowMinutes >= scheduledMinutes;
}

async function buildRows(): Promise<string[][]> {
  const [assignments, courses] = await Promise.all([
    db.getAssignments(),
    db.getCourses(),
  ]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const sorted = [...assignments].sort((a, b) => a.sortOrder - b.sortOrder);
  return [
    HEADERS,
    ...sorted.map((a) => {
      const course = a.courseId ? courseById.get(a.courseId) : null;
      return [
        a.title,
        course?.code || course?.name || "",
        a.status,
        a.dueAt || "",
        a.assignmentType,
        a.difficulty,
        a.pointsEarned == null ? "" : String(a.pointsEarned),
        a.pointsPossible == null ? "" : String(a.pointsPossible),
        a.notes || "",
        a.link || "",
      ];
    }),
  ];
}

/** Reuses the saved spreadsheet if it still exists, otherwise creates one. */
async function ensureBackupSpreadsheet(
  existingId: string | null,
): Promise<{ id: string; url: string }> {
  const sh = sheets();
  if (existingId) {
    try {
      const res = await sh.spreadsheets.get({ spreadsheetId: existingId });
      if (res.data.spreadsheetId && res.data.spreadsheetUrl) {
        return { id: res.data.spreadsheetId, url: res.data.spreadsheetUrl };
      }
    } catch {
      // Sheet was deleted or is no longer accessible — fall through and
      // create a fresh one rather than failing the backup outright.
    }
  }
  const created = await sh.spreadsheets.create({
    requestBody: {
      properties: { title: "Masterlist Backup" },
      sheets: [{ properties: { title: SHEET_TITLE } }],
    },
  });
  if (!created.data.spreadsheetId || !created.data.spreadsheetUrl) {
    throw new Error("Failed to create backup spreadsheet");
  }
  return { id: created.data.spreadsheetId, url: created.data.spreadsheetUrl };
}

async function writeBackup(spreadsheetId: string): Promise<void> {
  const sh = sheets();
  const rows = await buildRows();
  // Clear first so a shrinking list doesn't leave stale rows below the
  // fresh data (e.g. deleted assignments from a previous, longer backup).
  await sh.spreadsheets.values.clear({
    spreadsheetId,
    range: SHEET_TITLE,
  });
  await sh.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TITLE}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

async function runBackup(): Promise<string> {
  const settings = await db.getSettings();
  const tz = settings.timezone || "America/Detroit";
  const { id, url } = await ensureBackupSpreadsheet(
    settings.masterlistBackupSheetId,
  );
  await writeBackup(id);
  await db.updateSettings({
    lastMasterlistBackup: ymdInTimezone(new Date(), tz),
    masterlistBackupSheetId: id,
    masterlistBackupSheetUrl: url,
  });
  return url;
}

/** Cron entry point — writes only when the weekly schedule says it's due. */
export async function maybeBackupMasterlist(): Promise<void> {
  const settings = await db.getSettings();
  const tz = settings.timezone || "America/Detroit";
  if (!isBackupDue(settings, new Date(), tz)) return;
  await runBackup();
}

/** Settings page "Back up now" button — writes immediately, ignoring the schedule. */
export async function backupMasterlistNow(): Promise<{ url: string }> {
  const url = await runBackup();
  return { url };
}
