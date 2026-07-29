import * as db from "./db";
import { isCronActive } from "./cron-control";
import { getReply, replyAsText } from "./assistant";
import { formatDueSummary } from "./assignments";
import {
  getIncomingTexts,
  markMessageHandled,
  saveGoogleVoiceReply,
  sendSms,
  sendUserReply,
} from "./sms/gmail";
import { getDueReminders, markReminderSent } from "./reminders";
import { formatWeatherText } from "./weather";
import { calendar } from "./sms/gmail";

function log(msg: string) {
  console.error(msg);
}

async function maybeMorningBriefing(): Promise<void> {
  const settings = await db.getSettings();
  const tz = settings.timezone || "America/Detroit";
  const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const [h, m] = settings.morningBriefingTime.split(":").map(Number);
  const scheduled = new Date(nowLocal);
  scheduled.setHours(h || 8, m || 0, 0, 0);
  const today = nowLocal.toISOString().slice(0, 10);
  if (nowLocal < scheduled) {
    log("Morning briefing not due yet.");
    return;
  }
  if (settings.lastMorningBriefing === today) {
    log("Morning briefing already sent today.");
    return;
  }
  log("Sending morning briefing...");
  let events = "Nothing on calendar.";
  try {
    const cal = calendar();
    const start = new Date(nowLocal);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
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
      events = items
        .map((e, i) => {
          const raw = e.start?.dateTime || e.start?.date || "";
          const when = raw.includes("T")
            ? new Date(raw).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: tz,
              })
            : "All day";
          return `${i + 1}. ${when} — ${e.summary}`;
        })
        .join("\n");
    }
  } catch {
    /* ignore */
  }
  const weather = await formatWeatherText(0);
  let dueBlock = "";
  try {
    dueBlock = await formatDueSummary("today", tz);
  } catch {
    /* ignore */
  }
  const body = [
    "Good morning! ☀️",
    "",
    events,
    "",
    weather,
    dueBlock && !dueBlock.startsWith("Nothing") ? dueBlock : "",
  ]
    .filter((line, i, arr) => line !== "" || (arr[i - 1] && arr[i - 1] !== ""))
    .join("\n")
    .trim();
  await sendSms(body, "Good morning");
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
