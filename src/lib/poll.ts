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
import { maybeBackupMasterlist } from "./masterlist-backup";
import { formatWeatherAtHour } from "./weather";
import { calendar } from "./sms/gmail";
import {
  addDaysYmd,
  formatCompactTime,
  localHourMinute,
  wallTimeToUtc,
  ymdInTimezone,
} from "./zoned-time";

function log(msg: string) {
  console.error(msg);
}

async function maybeMorningBriefing(opts?: { force?: boolean }): Promise<void> {
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
  if (!opts?.force && dueMins < schedMins) {
    log("Morning briefing not due yet.");
    return;
  }
  if (!opts?.force && settings.lastMorningBriefing === today) {
    log("Morning briefing already sent today.");
    return;
  }
  // Claim today's briefing before sending anything, not after. The send loop
  // below is many sequential SMS parts (each ~1.5s apart plus its own Gmail
  // API round trip), which can outlast the external cron's 1–2 min interval.
  // Marking done only at the end left a window where a second cron tick,
  // still seeing "not sent today", would start its own concurrent send loop —
  // two interleaved bursts to the same GV thread, landing in whatever order
  // Gmail happened to process each individual send in, not the order either
  // loop intended (this is what caused events to arrive out of sequence).
  await db.updateSettings({ lastMorningBriefing: today });
  log(`Sending morning briefing for ${today} (${tz})...`);

  // One SMS for the whole schedule (single-\n lines, no blank lines — GV's
  // outbound relay only chokes on blank-line-joined bodies, not this). Each
  // event used to get its own SMS part, but Gmail → Google Voice doesn't
  // guarantee those arrive in the order they were sent, so events could show
  // up scrambled on the phone even though we send them correctly in order.
  // One atomic message has no cross-message order for GV to get wrong.
  let calendarParts = ["Schedule today: nothing on your calendar — nice breathing room."];
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
      // Exact event titles from Google Calendar — not reworded.
      const lines = items.map((e) => {
        const raw = e.start?.dateTime || e.start?.date || "";
        const when = raw.includes("T")
          ? formatCompactTime(new Date(raw), tz)
          : "All day";
        return `${when} - ${e.summary || "(no title)"}`;
      });
      calendarParts = [["Schedule today:", ...lines].join("\n")];
    }
  } catch (e) {
    log(`Calendar for briefing failed: ${e}`);
    calendarParts = [
      "Couldn't peek at your Google Calendar just now — I'll try again next time.",
    ];
  }

  const weather = await formatWeatherAtHour(schedH);

  let dueBlock = "Nothing due today — enjoy the lighter load.";
  try {
    dueBlock = await formatDueSummary("today", tz);
    if (dueBlock.startsWith("Nothing due")) {
      dueBlock = "Nothing due today — enjoy the lighter load.";
    } else if (dueBlock.startsWith("Due today:")) {
      dueBlock = dueBlock.replace("Due today:", "A few things due today:");
    }
  } catch (e) {
    log(`Due summary for briefing failed: ${e}`);
    dueBlock = "Couldn't load what's due today — check Masterlist when you can.";
  }

  const closers = [
    "You've got this — go make today yours.",
    "Up and at em! Make it a good one.",
    "Small steps count. Have a lovely day!",
    "Coffee (or tea) in hand — now go shine.",
    "Be kind to yourself today. You've got this.",
    "One thing at a time. Have a great day!",
    "Go get 'em — and don't forget to smile.",
  ];
  // Stable pick for the calendar day (not a random quote).
  const dayNum = Number(today.replace(/-/g, "")) || 0;
  const closer = closers[dayNum % closers.length]!;

  // Order: greeting → schedule (one SMS per event) → weather → due → closer.
  // Blank-line-joined parts (e.g. "Good morning!\n\n...") were getting cut
  // off by Google Voice's outbound relay, so keep every part single-block.
  const parts = ["Good morning!", ...calendarParts, weather, dueBlock, closer];
  log(`Briefing parts: ${parts.map((p) => p.length).join(", ")} chars`);
  await sendSmsParts(parts);
  log("Morning briefing sent.");
}

/** Force-send the morning briefing (ignores schedule + already-sent-today). */
export async function sendMorningBriefingNow(): Promise<void> {
  await maybeMorningBriefing({ force: true });
}

export async function runPollCycle(opts?: {
  force?: boolean;
}): Promise<{ skipped: boolean; reason?: string; replies?: number }> {
  const cronControl = await db.getCronControl();
  const gate = isCronActive(cronControl);
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

  // 4) weekly Masterlist -> Google Sheets backup
  try {
    await maybeBackupMasterlist();
  } catch (e) {
    log(`Masterlist backup failed: ${e}`);
  }

  return { skipped: false, replies };
}
