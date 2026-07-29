import * as db from "./db";
import { isCronActive } from "./cron-control";
import { getReply, replyAsText } from "./assistant";
import { formatDueSummary } from "./assignments";
import {
  getIncomingTexts,
  markMessageHandled,
  saveGoogleVoiceReply,
  sendSms,
  sendSmsParts,
  sendUserReply,
} from "./sms/gmail";
import { getDueReminders, markReminderSent } from "./reminders";
import { formatWeatherText } from "./weather";
import { calendar } from "./sms/gmail";

function log(msg: string) {
  console.error(msg);
}

function ymdInTimezone(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

function localHourMinute(
  date: Date,
  timeZone: string,
): { hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  let hour = parseInt(parts.hour || "0", 10);
  if (hour === 24) hour = 0;
  return { hour, minute: parseInt(parts.minute || "0", 10) };
}

/** UTC instant for Y-M-D HH:MM wall time in `timeZone`. */
function wallTimeToUtc(
  ymd: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  let ms = Date.UTC(y!, mo! - 1, d!, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .formatToParts(new Date(ms))
        .map((p) => [p.type, p.value]),
    );
    let ph = parseInt(parts.hour || "0", 10);
    if (ph === 24) ph = 0;
    const asIf = Date.UTC(
      parseInt(parts.year!, 10),
      parseInt(parts.month!, 10) - 1,
      parseInt(parts.day!, 10),
      ph,
      parseInt(parts.minute!, 10),
      parseInt(parts.second || "0", 10),
    );
    const want = Date.UTC(y!, mo! - 1, d!, hour, minute, 0);
    ms += want - asIf;
  }
  return new Date(ms);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + days, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

async function maybeMorningBriefing(): Promise<void> {
  const settings = await db.getSettings();
  const tz = settings.timezone || "America/Detroit";
  const now = new Date();
  const today = ymdInTimezone(now, tz);
  const { hour, minute } = localHourMinute(now, tz);
  const [h, m] = settings.morningBriefingTime.split(":").map(Number);
  const schedH = h || 8;
  const schedM = m || 0;
  const dueMins = hour * 60 + minute;
  const schedMins = schedH * 60 + schedM;
  if (dueMins < schedMins) {
    log("Morning briefing not due yet.");
    return;
  }
  if (settings.lastMorningBriefing === today) {
    log("Morning briefing already sent today.");
    return;
  }
  log(`Sending morning briefing for ${today} (${tz})...`);

  let calendarBlock = "Calendar: nothing on the schedule.";
  try {
    const cal = calendar();
    const start = wallTimeToUtc(today, 0, 0, tz);
    const end = wallTimeToUtc(addDaysYmd(today, 1), 0, 0, tz);
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 15,
    });
    const items = (res.data.items || []).filter(
      (e) => !(e.summary || "").startsWith("SMS-"),
    );
    if (items.length) {
      const lines = items.map((e, i) => {
        const raw = e.start?.dateTime || e.start?.date || "";
        const when = raw.includes("T")
          ? new Date(raw).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: tz,
            })
          : "All day";
        return `${i + 1}. ${when} - ${e.summary || "(no title)"}`;
      });
      calendarBlock = ["Calendar today:", ...lines].join("\n");
    }
  } catch (e) {
    log(`Calendar for briefing failed: ${e}`);
    calendarBlock = "Calendar: couldn't load events.";
  }

  const weather = await formatWeatherText(0);

  let dueBlock = "Nothing due today.";
  try {
    dueBlock = await formatDueSummary("today", tz);
  } catch (e) {
    log(`Due summary for briefing failed: ${e}`);
    dueBlock = "Due today: couldn't load.";
  }

  // Short separate texts — one long emoji-heavy SMS often arrives as just the greeting via GV.
  const parts = [
    `Good morning!\n\n${calendarBlock}`,
    weather,
    dueBlock,
  ];
  log(`Briefing parts: ${parts.map((p) => p.length).join(", ")} chars`);
  await sendSmsParts(parts);
  await db.updateSettings({ lastMorningBriefing: today });
  log("Morning briefing sent.");
}

export async function runPollCycle(opts?: {
  force?: boolean;
}): Promise<{ skipped: boolean; reason?: string; replies?: number }> {
  const settings = await db.getSettings();
  const gate = isCronActive(settings.cronControl);
  if (!opts?.force && !gate.active) {
    log(`Cron skip: ${gate.reason}`);
    return { skipped: true, reason: gate.reason };
  }

  log(`Cron active (${gate.reason}) — polling...`);
  let replies = 0;

  // 1) inbound texts — process every unanswered message (oldest first),
  // not just one per GV thread.
  try {
    const incoming = await getIncomingTexts();
    log(`Found ${incoming.length} message(s) needing reply.`);
    for (const text of incoming) {
      try {
        if (await db.wasProcessed(text.id)) {
          log(`Skip already processed ${text.id}`);
          continue;
        }
        if (!text.body.trim()) {
          await markMessageHandled(text.id);
          await db.markProcessed(text.id, text.threadId);
          continue;
        }
        await saveGoogleVoiceReply(text.from);
        const reply = await getReply(text.body, []);
        await sendUserReply(
          text.from,
          text.subject || "assistant",
          reply,
          text.threadId,
        );
        await markMessageHandled(text.id);
        await db.markProcessed(text.id, text.threadId);
        replies += 1;
        log(`Replied to message ${text.id}: ${replyAsText(reply).slice(0, 80)}`);
      } catch (e) {
        log(`Error handling message ${text.id}: ${e}`);
        try {
          await sendUserReply(
            text.from,
            text.subject || "assistant",
            "Sorry, I don't think I can do that.",
            text.threadId,
          );
          await markMessageHandled(text.id);
          await db.markProcessed(text.id, text.threadId);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    log(`Inbox poll failed: ${e}`);
  }

  // 2) reminders
  try {
    const due = await getDueReminders();
    for (const r of due) {
      await sendSms(r.message, "Reminder");
      await markReminderSent(r.id);
      log(`Sent reminder: ${r.message}`);
    }
  } catch (e) {
    log(`Reminders failed: ${e}`);
  }

  // 3) morning briefing
  try {
    await maybeMorningBriefing();
  } catch (e) {
    log(`Briefing failed: ${e}`);
  }

  return { skipped: false, replies };
}
