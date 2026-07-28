import Groq from "groq-sdk";
import * as db from "../db";
import * as lists from "../lists";
import * as reminders from "../reminders";
import { extractLocationPhrase, resolvePlace } from "../location";
import { formatWeatherText } from "../weather";
import { calendar } from "../sms/gmail";

const MODEL = "llama-3.3-70b-versatile";

const QUOTES = [
  "The best way to predict the future is to create it.",
  "You are capable of more than you know.",
  "Small steps every day add up to big changes.",
  "Today is a good day to have a good day.",
  "Progress, not perfection.",
  "You don't have to be perfect to be amazing.",
  "Believe you can and you're halfway there.",
  "Every day is a fresh start.",
  "One thing at a time. You've got this.",
  "Make today ridiculously amazing.",
];

function groq() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is not set");
  return new Groq({ apiKey: key });
}

function shorthandText(message: string): string {
  const line = message.trim().split("\n")[0]?.trim() || "";
  if (line.length >= 2 && line[0] === line[line.length - 1] && `'\"`.includes(line[0])) {
    return line.slice(1, -1).trim();
  }
  return line;
}

function findCommandLine(message: string): string | null {
  for (const raw of message.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/^>/, "").trim();
    if (!line || /^On .+ wrote:$/.test(line)) continue;
    if (
      /^\.([a-z][\w-]*)\s*$/i.test(line) ||
      /^\.([a-z][\w-]*)\s*:?\s+.+/i.test(line) ||
      /^mlem+\W*$/i.test(line) ||
      /^quote\s*$/i.test(line) ||
      /^note:?\s+/i.test(line) ||
      /^timezone\s+/i.test(line) ||
      extractLocationPhrase(line) !== null ||
      /^done\s+/i.test(line) ||
      /^-\s*.+/.test(line) ||
      /^what'?s left on (\.\w+)\s*$/i.test(line)
    ) {
      return line;
    }
  }
  return null;
}

const CATS = [
  " /\\_/\\\n\n( o.o )\n\n > ^ <\n\n mlem",
  "|\\_/|\n\n| @ @  mlem\n\n \\_u_/",
  "(^._.^) mlem",
  "=^..^= mlem",
];

function mlemResponse(): string {
  return CATS[Math.floor(Math.random() * CATS.length)]!;
}

export type Reply =
  | string
  | { smsParts: string[] };

export async function tryMessageShorthand(
  message: string,
): Promise<Reply | null> {
  if (/^mlem+\W*$/im.test(message) || findCommandLine(message)?.match(/^mlem+\W*$/i)) {
    return mlemResponse();
  }
  const text =
    findCommandLine(message) || shorthandText(message);

  if (/^quote\s*$/i.test(text)) {
    const day = Math.floor(Date.now() / 86400000);
    return `✨ Quote of the day:\n${QUOTES[day % QUOTES.length]}`;
  }
  const tz = text.match(/^timezone\s+(.+)$/i);
  if (tz) {
    const name = tz[1].trim();
    try {
      Intl.DateTimeFormat(undefined, { timeZone: name });
    } catch {
      return "Sorry, I couldn't understand that timezone — try America/Detroit or America/New_York.";
    }
    await db.updateSettings({
      timezone: name,
      cronControl: { ...(await db.getSettings()).cronControl, timezone: name },
    });
    return `got it — timezone set to ${name}`;
  }
  const placePhrase = extractLocationPhrase(text);
  if (placePhrase) {
    return setLocationFromPlace(placePhrase);
  }
  const note = text.match(/^note:?\s+(.+)$/i);
  if (note) {
    const stamp = new Date().toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return addToListReply(lists.DEFAULT_NOTES, [`${stamp} — ${note[1].trim()}`]);
  }
  const left = text.match(/^what'?s left on (\.\w+)\s*$/i);
  if (left) return lists.smsParts(await lists.getListParts(left[1]));

  const done = text.match(/^done\s+(.+?)(?:\s+on\s+(\.\w+))?\s*$/i);
  if (done) {
    const listName = lists.normalizeListName(done[2] || lists.DEFAULT_GROCERY);
    const item = await db.checkOffListItem(listName, done[1].trim());
    return item
      ? `Checked off ${item.text} from .${listName} ✓`
      : `Couldn't find that item on '.${listName}'.`;
  }
  const dash = text.match(/^-\s*(.+)$/);
  if (dash) {
    const listName = lists.DEFAULT_GROCERY;
    const item = await db.checkOffListItem(listName, dash[1].trim());
    return item
      ? `Checked off ${item.text} from .${listName} ✓`
      : `Couldn't find that item on '.${listName}'.`;
  }

  const show = text.match(/^\.([a-z][\w-]*)\s*$/i);
  if (show) return lists.smsParts(await lists.getListParts(show[1]));

  const add = text.match(/^\.([a-z][\w-]*)\s*:?\s+(.+)$/i);
  if (add) {
    const items = add[2]
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return addToListReply(add[1], items);
  }
  return null;
}

async function addToListReply(listName: string, items: string[]) {
  return lists.addToList(listName, items);
}

async function setLocationFromPlace(place: string): Promise<string> {
  const resolved = await resolvePlace(place);
  if (!resolved) {
    return `Couldn't find "${place}" — try a city name like Seattle or Detroit.`;
  }
  const s = await db.getSettings();
  await db.updateSettings({
    weatherCity: resolved.label.split(",")[0]?.trim() || resolved.label,
    timezone: resolved.timezone,
    cronControl: { ...s.cronControl, timezone: resolved.timezone },
  });
  return `got it — you're in ${resolved.label} now (${resolved.timezone}). Weather + reminders will use that.`;
}

const SYSTEM_PROMPT = `You are a personal assistant reachable over SMS. Voice: warm fun friend — genuinely glad to see them, rooting for them, not a service rep.

VOICE / TONE:
- Warm and personally invested. Use "I" naturally.
- Emojis: 1 max per message, sometimes none. Never stacked.
- Short, breathable sentences. No markdown.
- Keep replies SHORT (1-3 sentences) unless listing calendar/lists.
- For reminders use schedule_reminder / schedule_recurring_reminder — NOT create_calendar_event.
- Only create_calendar_event when user explicitly asks to add to Google Calendar.
- Lists use dot prefix (.groceries, .todo). Prefer tools for calendar, weather, lists, reminders.
- When user says they moved / are in a new city (e.g. "I'm in Seattle now"), call set_location.
- If you cannot do something, say so simply without forced emoji.`;

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_list",
      description: "Show a dot list (.groceries sorted by aisle).",
      parameters: {
        type: "object",
        properties: { list_name: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_list",
      description: "Add items to a list.",
      parameters: {
        type: "object",
        properties: {
          list_name: { type: "string" },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_list",
      description: "Clear all items from a list.",
      parameters: {
        type: "object",
        properties: { list_name: { type: "string" } },
        required: ["list_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_off_list_item",
      description: "Check off an item by name or number.",
      parameters: {
        type: "object",
        properties: {
          list_name: { type: "string" },
          item_or_index: { type: "string" },
        },
        required: ["item_or_index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Weather for today (0) or tomorrow (1).",
      parameters: {
        type: "object",
        properties: { days_ahead: { type: "integer" } },
        required: ["days_ahead"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quote",
      description: "Quote of the day.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "List active SMS reminders.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_reminder",
      description: "One-time SMS reminder. remind_at_iso is local datetime without Z.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          remind_at_iso: { type: "string" },
        },
        required: ["message", "remind_at_iso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_recurring_reminder",
      description: "Recurring SMS reminder. frequency: daily, weekdays, monday, weekly:MO",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          fire_time: { type: "string", description: "HH:MM 24h" },
          frequency: { type: "string" },
        },
        required: ["message", "fire_time", "frequency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description: "Cancel reminders matching search text.",
      parameters: {
        type: "object",
        properties: { search_text: { type: "string" } },
        required: ["search_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_timezone",
      description: "Set IANA timezone e.g. America/Detroit",
      parameters: {
        type: "object",
        properties: { tz_name: { type: "string" } },
        required: ["tz_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_location",
      description:
        "Update weather city + timezone from a place name (Seattle, Detroit, NYC, etc.). Use when user says they are in / moved to a city.",
      parameters: {
        type: "object",
        properties: { place: { type: "string" } },
        required: ["place"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_morning_briefing_time",
      description: "Set morning briefing time HH:MM",
      parameters: {
        type: "object",
        properties: { time_str: { type: "string" } },
        required: ["time_str"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_events_for_day",
      description: "Calendar events for a day (today/tomorrow/YYYY-MM-DD).",
      parameters: {
        type: "object",
        properties: { date: { type: "string" } },
        required: ["date"],
      },
    },
  },
];

async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Reply | string> {
  switch (name) {
    case "get_list":
      return lists.smsParts(
        await lists.getListParts(String(args.list_name || "")),
      );
    case "add_to_list":
      return lists.addToList(
        String(args.list_name || lists.DEFAULT_GROCERY),
        (args.items as string[]) || [],
      );
    case "clear_list": {
      const n = lists.normalizeListName(String(args.list_name || ""));
      const count = await db.clearList(n);
      return count
        ? `Success: cleared ${count} item(s) from '.${n}' list.`
        : `Your '.${n}' list is already empty.`;
    }
    case "check_off_list_item": {
      const n = lists.normalizeListName(
        String(args.list_name || lists.DEFAULT_GROCERY),
      );
      const item = await db.checkOffListItem(
        n,
        String(args.item_or_index || ""),
      );
      return item
        ? `Checked off ${item.text} from .${n} ✓`
        : `Couldn't find that item on '.${n}'.`;
    }
    case "get_weather":
      return formatWeatherText(Number(args.days_ahead || 0));
    case "get_quote": {
      const day = Math.floor(Date.now() / 86400000);
      return `✨ Quote of the day:\n${QUOTES[day % QUOTES.length]}`;
    }
    case "list_reminders":
      return lists.smsParts(await reminders.listRemindersParts());
    case "schedule_reminder":
      await db.addReminder({
        message: String(args.message),
        remindAt: String(args.remind_at_iso).replace(/Z$/, "").slice(0, 19),
        frequency: "once",
        fireTime: null,
      });
      return `Success: reminder set for ${args.remind_at_iso}.`;
    case "schedule_recurring_reminder":
      await db.addReminder({
        message: String(args.message),
        remindAt: null,
        frequency: String(args.frequency),
        fireTime: String(args.fire_time),
      });
      return `Success: recurring reminder set (${args.frequency} at ${args.fire_time}).`;
    case "cancel_reminder": {
      const n = await db.deleteRemindersMatching(String(args.search_text));
      return n
        ? `Cancelled ${n} reminder(s) matching '${args.search_text}'.`
        : `Couldn't find a reminder matching '${args.search_text}'.`;
    }
    case "set_timezone": {
      const name = String(args.tz_name).trim();
      try {
        Intl.DateTimeFormat(undefined, { timeZone: name });
      } catch {
        return "Sorry, I couldn't understand that timezone.";
      }
      const s = await db.getSettings();
      await db.updateSettings({
        timezone: name,
        cronControl: { ...s.cronControl, timezone: name },
      });
      return `got it — timezone set to ${name}`;
    }
    case "set_location":
      return setLocationFromPlace(String(args.place || ""));
    case "set_morning_briefing_time": {
      const t = String(args.time_str).trim();
      await db.updateSettings({ morningBriefingTime: t });
      return `Success: morning briefing set for ${t}.`;
    }
    case "get_events_for_day":
      return getEventsForDay(String(args.date || "today"));
    default:
      return `Error: tool '${name}' not found.`;
  }
}

async function getEventsForDay(dateStr: string): Promise<Reply> {
  const settings = await db.getSettings();
  const tz = settings.timezone || "America/Detroit";
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: tz }),
  );
  let day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const lower = dateStr.trim().toLowerCase();
  if (lower === "tomorrow") day.setDate(day.getDate() + 1);
  else if (lower === "yesterday") day.setDate(day.getDate() - 1);
  else if (/^\d{4}-\d{2}-\d{2}/.test(lower)) {
    day = new Date(lower.slice(0, 10) + "T00:00:00");
  }
  const end = new Date(day);
  end.setDate(end.getDate() + 1);
  try {
    const cal = calendar();
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: day.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 25,
    });
    const items = (res.data.items || []).filter(
      (e) =>
        !(e.summary || "").startsWith("SMS-"),
    );
    const label = day.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: tz,
    });
    if (!items.length) return `Nothing on your calendar for ${label}.`;
    const parts = [`📅 ${label}:`];
    items.forEach((e, i) => {
      const start = e.start?.dateTime || e.start?.date || "";
      let when = "All day";
      if (start.includes("T")) {
        when = new Date(start).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: tz,
        });
      }
      parts.push(`${i + 1}. ${when} — ${e.summary || "(no title)"}`);
    });
    return lists.smsParts(parts);
  } catch (e) {
    return `Couldn't read calendar: ${e instanceof Error ? e.message : e}`;
  }
}

const KNOWLEDGE_RE =
  /^(who (?:is|was|are|were)|what(?:'s| is| are| was| were)|when (?:did|was|is|are)|where (?:is|was|are|were|did)|why (?:did|is|was|are|do|does)|how (?:did|does|do|old|many|much|long)|tell me about|define|explain)\b/i;

const ASSISTANT_KW =
  /\b(calendar|remind|reminder|groceries|grocery|\.notes|\.groceries|\.todo|briefing|schedule|umbrella|weather|free at|am i free|my list|gcal|google calendar|check off|snooze|cancel reminder|i'?m in|timezone|location)\b/i;

async function answerKnowledge(question: string): Promise<string> {
  const client = groq();
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content:
          "Answer general knowledge over SMS. Fun-friend voice, 1 emoji max often none. 2-5 short sentences. No markdown.",
      },
      { role: "user", content: shorthandText(question) },
    ],
  });
  return res.choices[0]?.message?.content || "honestly I'm not sure about that one.";
}

export async function getReply(
  userMessage: string,
  history: { role: string; content: string }[] = [],
): Promise<Reply> {
  const shorthand = await tryMessageShorthand(userMessage);
  if (shorthand) return shorthand;

  const cleaned = shorthandText(userMessage);
  if (KNOWLEDGE_RE.test(cleaned) && !ASSISTANT_KW.test(cleaned)) {
    try {
      return await answerKnowledge(userMessage);
    } catch {
      /* fall through */
    }
  }

  const settings = await db.getSettings();
  const client = groq();
  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        SYSTEM_PROMPT +
        `\n\nUser timezone: ${settings.timezone}` +
        `\nWeather city: ${settings.weatherCity}` +
        `\nMorning briefing: ${settings.morningBriefingTime}`,
    },
    ...history.slice(-12).map((h) => ({
      role: (h.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: h.content,
    })),
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < 6; i++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.7,
    });
    const msg = res.choices[0]?.message;
    if (!msg) return "sorry, I don't think I can do that";

    if (msg.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: msg.tool_calls,
      });
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}") as Record<
          string,
          unknown
        >;
        const result = await runTool(tc.function.name, args);
        if (
          msg.tool_calls.length === 1 &&
          typeof result === "object" &&
          result &&
          "smsParts" in result
        ) {
          return result;
        }
        const content =
          typeof result === "string"
            ? result
            : (result as { smsParts: string[] }).smsParts.join("\n");
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content,
        });
        if (
          msg.tool_calls.length === 1 &&
          ["get_list", "list_reminders", "get_events_for_day"].includes(
            tc.function.name,
          )
        ) {
          return typeof result === "string" ? result : result;
        }
      }
      continue;
    }
    return msg.content || "sorry, I don't think I can do that";
  }
  return "sorry, I don't think I can do that";
}

export function replyAsText(reply: Reply): string {
  if (typeof reply === "string") return reply;
  return reply.smsParts.join("\n");
}
