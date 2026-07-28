import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  Assignment,
  AssignmentDifficulty,
  AssignmentStatus,
  Course,
  CourseLink,
  ListItem,
  Reminder,
  Store,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import * as local from "./local";

function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
  );
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Prefer Supabase when configured; otherwise local JSON file. */
export function dbProvider(): "supabase" | "local" {
  return hasSupabase() ? "supabase" : "local";
}

export async function getSettings(): Promise<AppSettings> {
  if (!hasSupabase()) return local.getSettings();
  const sb = client();
  const { data, error } = await sb.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  const payload = (data.payload || {}) as Partial<AppSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...payload,
    cronControl: {
      ...DEFAULT_SETTINGS.cronControl,
      ...(payload.cronControl || {}),
    },
    uiTheme: {
      ...DEFAULT_SETTINGS.uiTheme,
      ...(payload.uiTheme || {}),
      custom: {
        ...DEFAULT_SETTINGS.uiTheme.custom,
        ...(payload.uiTheme?.custom || {}),
      },
    },
    listCatalog:
      payload.listCatalog && payload.listCatalog.length
        ? payload.listCatalog
        : DEFAULT_SETTINGS.listCatalog,
    dashboardLayout:
      payload.dashboardLayout?.widgets?.length
        ? payload.dashboardLayout
        : DEFAULT_SETTINGS.dashboardLayout,
  };
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  if (!hasSupabase()) return local.updateSettings(patch);
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    cronControl: { ...current.cronControl, ...(patch.cronControl || {}) },
    uiTheme: {
      ...current.uiTheme,
      ...(patch.uiTheme || {}),
      custom: {
        ...current.uiTheme.custom,
        ...(patch.uiTheme?.custom || {}),
      },
    },
    dashboardLayout: patch.dashboardLayout ?? current.dashboardLayout,
  };
  const sb = client();
  await sb.from("app_settings").upsert({ id: 1, payload: next });
  return next;
}

export async function getListItems(listName?: string): Promise<ListItem[]> {
  if (!hasSupabase()) return local.getListItems(listName);
  const sb = client();
  let q = sb.from("list_items").select("*").order("sort_order");
  if (listName) q = q.eq("list_name", listName);
  const { data } = await q;
  return (data || []).map(rowToListItem);
}

function rowToListItem(row: Record<string, unknown>): ListItem {
  return {
    id: String(row.id),
    listName: String(row.list_name),
    text: String(row.text),
    checked: Boolean(row.checked),
    difficulty: (String(row.difficulty || "medium") as ListItem["difficulty"]),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
  };
}

export async function addListItems(
  listName: string,
  texts: string[],
): Promise<{ added: ListItem[]; skipped: string[] }> {
  if (!hasSupabase()) return local.addListItems(listName, texts);
  const settings = await getSettings();
  if (!settings.listCatalog.includes(listName)) {
    await updateSettings({
      listCatalog: [...settings.listCatalog, listName].sort(),
    });
  }
  const existing = await getListItems(listName);
  const seen = new Set(
    existing.filter((i) => !i.checked).map((i) => i.text.toLowerCase()),
  );
  const added: ListItem[] = [];
  const skipped: string[] = [];
  let order = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;
  const sb = client();
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    if (seen.has(text.toLowerCase())) {
      skipped.push(text);
      continue;
    }
    seen.add(text.toLowerCase());
    const { data } = await sb
      .from("list_items")
      .insert({
        list_name: listName,
        text,
        checked: false,
        difficulty: "medium",
        sort_order: order++,
      })
      .select("*")
      .single();
    if (data) added.push(rowToListItem(data));
  }
  return { added, skipped };
}

export async function checkOffListItem(
  listName: string,
  itemOrIndex: string,
): Promise<ListItem | null> {
  if (!hasSupabase()) return local.checkOffListItem(listName, itemOrIndex);
  const active = (await getListItems(listName)).filter((i) => !i.checked);
  let target: ListItem | undefined;
  if (/^\d+$/.test(itemOrIndex.trim())) {
    target = active[parseInt(itemOrIndex.trim(), 10) - 1];
  } else {
    const needle = itemOrIndex.trim().toLowerCase();
    target = active.find((i) => i.text.toLowerCase() === needle);
  }
  if (!target) return null;
  const sb = client();
  const { data } = await sb
    .from("list_items")
    .update({ checked: true })
    .eq("id", target.id)
    .select("*")
    .single();
  return data ? rowToListItem(data) : null;
}

export async function updateListItem(
  id: string,
  patch: Partial<Pick<ListItem, "checked" | "difficulty" | "text" | "sortOrder">>,
): Promise<ListItem | null> {
  if (!hasSupabase()) return local.updateListItem(id, patch);
  const sb = client();
  const body: Record<string, unknown> = {};
  if (patch.checked !== undefined) body.checked = patch.checked;
  if (patch.difficulty !== undefined) body.difficulty = patch.difficulty;
  if (patch.text !== undefined) body.text = patch.text;
  if (patch.sortOrder !== undefined) body.sort_order = patch.sortOrder;
  const { data, error } = await sb
    .from("list_items")
    .update(body)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToListItem(data as Record<string, unknown>);
}

export async function removeListItems(
  listName: string,
  items: string[],
): Promise<string[]> {
  if (!hasSupabase()) return local.removeListItems(listName, items);
  const removed: string[] = [];
  const sb = client();
  for (const target of items) {
    const active = (await getListItems(listName)).filter((i) => !i.checked);
    let hit: ListItem | undefined;
    if (/^\d+$/.test(target.trim())) {
      hit = active[parseInt(target.trim(), 10) - 1];
    } else {
      hit = active.find((i) => i.text.toLowerCase() === target.trim().toLowerCase());
    }
    if (hit) {
      await sb.from("list_items").delete().eq("id", hit.id);
      removed.push(hit.text);
    }
  }
  return removed;
}

export async function clearList(listName: string): Promise<number> {
  if (!hasSupabase()) return local.clearList(listName);
  const items = await getListItems(listName);
  const sb = client();
  await sb.from("list_items").delete().eq("list_name", listName);
  return items.length;
}

export async function getListNames(): Promise<string[]> {
  if (!hasSupabase()) return local.getListNames();
  const settings = await getSettings();
  const items = await getListItems();
  const names = new Set<string>([
    ...settings.listCatalog,
    ...items.map((i) => i.listName),
  ]);
  return [...names].filter(Boolean).sort();
}

export async function createList(listName: string): Promise<string[]> {
  if (!hasSupabase()) return local.createList(listName);
  const settings = await getSettings();
  const name = listName.trim().toLowerCase();
  if (!name) return getListNames();
  const catalog = Array.from(
    new Set([...(settings.listCatalog || []), name]),
  ).sort();
  await updateSettings({ listCatalog: catalog });
  return getListNames();
}

export async function renameList(
  from: string,
  to: string,
): Promise<string[]> {
  if (!hasSupabase()) return local.renameList(from, to);
  const oldName = from.trim().toLowerCase();
  const newName = to.trim().toLowerCase();
  if (!oldName || !newName || oldName === newName) return getListNames();
  const sb = client();
  await sb
    .from("list_items")
    .update({ list_name: newName })
    .eq("list_name", oldName);
  const settings = await getSettings();
  const catalog = Array.from(
    new Set(
      (settings.listCatalog || [])
        .map((n) => (n === oldName ? newName : n))
        .concat(newName),
    ),
  ).sort();
  await updateSettings({ listCatalog: catalog });
  return getListNames();
}

export async function deleteList(listName: string): Promise<string[]> {
  if (!hasSupabase()) return local.deleteList(listName);
  const name = listName.trim().toLowerCase();
  await clearList(name);
  const settings = await getSettings();
  const catalog = (settings.listCatalog || []).filter((n) => n !== name);
  await updateSettings({ listCatalog: catalog });
  return getListNames();
}

export async function getReminders(): Promise<Reminder[]> {
  if (!hasSupabase()) return local.getReminders();
  const sb = client();
  const { data } = await sb
    .from("reminders")
    .select("*")
    .eq("sent", false)
    .order("created_at");
  return (data || []).map(rowToReminder);
}

function rowToReminder(row: Record<string, unknown>): Reminder {
  return {
    id: String(row.id),
    message: String(row.message),
    remindAt: (row.remind_at as string) || null,
    frequency: String(row.frequency || "once") as Reminder["frequency"],
    fireTime: (row.fire_time as string) || null,
    lastSent: (row.last_sent as string) || null,
    snoozedUntil: (row.snoozed_until as string) || null,
    sent: Boolean(row.sent),
    createdAt: String(row.created_at),
  };
}

export async function addReminder(
  reminder: Parameters<typeof local.addReminder>[0],
): Promise<Reminder> {
  if (!hasSupabase()) return local.addReminder(reminder);
  const sb = client();
  const { data } = await sb
    .from("reminders")
    .insert({
      message: reminder.message,
      remind_at: reminder.remindAt,
      frequency: reminder.frequency,
      fire_time: reminder.fireTime,
      sent: reminder.sent ?? false,
      last_sent: reminder.lastSent ?? null,
      snoozed_until: reminder.snoozedUntil ?? null,
    })
    .select("*")
    .single();
  if (!data) throw new Error("Failed to insert reminder");
  return rowToReminder(data);
}

export async function updateReminder(
  id: string,
  patch: Partial<Reminder>,
): Promise<Reminder | null> {
  if (!hasSupabase()) return local.updateReminder(id, patch);
  const sb = client();
  const body: Record<string, unknown> = {};
  if (patch.message !== undefined) body.message = patch.message;
  if (patch.remindAt !== undefined) body.remind_at = patch.remindAt;
  if (patch.frequency !== undefined) body.frequency = patch.frequency;
  if (patch.fireTime !== undefined) body.fire_time = patch.fireTime;
  if (patch.lastSent !== undefined) body.last_sent = patch.lastSent;
  if (patch.snoozedUntil !== undefined) body.snoozed_until = patch.snoozedUntil;
  if (patch.sent !== undefined) body.sent = patch.sent;
  const { data } = await sb.from("reminders").update(body).eq("id", id).select("*").single();
  return data ? rowToReminder(data) : null;
}

export async function deleteRemindersMatching(search: string): Promise<number> {
  if (!hasSupabase()) return local.deleteRemindersMatching(search);
  const all = await getReminders();
  const needle = search.trim().toLowerCase();
  const hits = all.filter((r) => r.message.toLowerCase().includes(needle));
  const sb = client();
  for (const h of hits) await sb.from("reminders").delete().eq("id", h.id);
  return hits.length;
}

export async function wasProcessed(gmailMessageId: string): Promise<boolean> {
  if (!hasSupabase()) return local.wasProcessed(gmailMessageId);
  const sb = client();
  const { data } = await sb
    .from("processed_messages")
    .select("gmail_message_id")
    .eq("gmail_message_id", gmailMessageId)
    .maybeSingle();
  return Boolean(data);
}

export async function markProcessed(
  gmailMessageId: string,
  threadId: string,
): Promise<void> {
  if (!hasSupabase()) return local.markProcessed(gmailMessageId, threadId);
  const sb = client();
  await sb.from("processed_messages").upsert({
    gmail_message_id: gmailMessageId,
    thread_id: threadId,
    processed_at: new Date().toISOString(),
  });
}

export async function getFullStore(): Promise<Store> {
  if (!hasSupabase()) return local.getFullStore();
  return {
    settings: await getSettings(),
    listItems: await getListItems(),
    reminders: await getReminders(),
    processedMessages: [],
    courses: await getCourses(),
    assignments: await getAssignments(),
  };
}

function parseCourseLinks(raw: unknown): CourseLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const url = String(o.url || "").trim();
      if (!url) return null;
      return {
        label: String(o.label || "").trim() || "Link",
        url,
      };
    })
    .filter(Boolean) as CourseLink[];
}

function rowToCourse(row: Record<string, unknown>): Course {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code || ""),
    color: String(row.color || "#0f766e"),
    professor: String(row.professor || ""),
    schedule: String(row.schedule || ""),
    links: parseCourseLinks(row.links),
    sortOrder: Number(row.sort_order || 0),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function rowToAssignment(row: Record<string, unknown>): Assignment {
  return {
    id: String(row.id),
    courseId: row.course_id ? String(row.course_id) : null,
    title: String(row.title),
    status: (String(row.status || "not_started") as AssignmentStatus),
    dueAt: row.due_at ? String(row.due_at) : null,
    assignmentType: String(row.assignment_type || "Homework"),
    difficulty: (String(row.difficulty || "medium") as AssignmentDifficulty),
    pointsEarned:
      row.points_earned == null ? null : Number(row.points_earned),
    pointsPossible:
      row.points_possible == null ? null : Number(row.points_possible),
    notes: String(row.notes || ""),
    link: String(row.link || ""),
    sortOrder: Number(row.sort_order || 0),
    dueReminderSentFor: row.due_reminder_sent_for
      ? String(row.due_reminder_sent_for)
      : null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function getCourses(): Promise<Course[]> {
  if (!hasSupabase()) return local.getCourses();
  const sb = client();
  const { data } = await sb.from("courses").select("*").order("sort_order");
  return (data || []).map((r) => rowToCourse(r as Record<string, unknown>));
}

export async function upsertCourse(
  input: Partial<Course> & { name: string },
): Promise<Course> {
  if (!hasSupabase()) return local.upsertCourse(input);
  const sb = client();
  if (input.id) {
    const body: Record<string, unknown> = { name: input.name };
    if (input.code !== undefined) body.code = input.code;
    if (input.color !== undefined) body.color = input.color;
    if (input.professor !== undefined) body.professor = input.professor;
    if (input.schedule !== undefined) body.schedule = input.schedule;
    if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;
    if (input.links !== undefined) body.links = input.links;
    const { data, error } = await sb
      .from("courses")
      .update(body)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message || "Failed to save course");
    }
    return rowToCourse(data as Record<string, unknown>);
  }
  const { data, error } = await sb
    .from("courses")
    .insert({
      name: input.name,
      code: input.code ?? "",
      color: input.color ?? "#0f766e",
      professor: input.professor ?? "",
      schedule: input.schedule ?? "",
      sort_order: input.sortOrder ?? 0,
      links: input.links ?? [],
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to save course");
  return rowToCourse(data as Record<string, unknown>);
}

export async function deleteCourse(id: string): Promise<void> {
  if (!hasSupabase()) return local.deleteCourse(id);
  const sb = client();
  await sb.from("assignments").update({ course_id: null }).eq("course_id", id);
  await sb.from("courses").delete().eq("id", id);
}

export async function getAssignments(): Promise<Assignment[]> {
  if (!hasSupabase()) return local.getAssignments();
  const sb = client();
  const { data } = await sb
    .from("assignments")
    .select("*")
    .order("sort_order");
  return (data || []).map((r) => rowToAssignment(r as Record<string, unknown>));
}

export async function upsertAssignment(
  input: Partial<Assignment> & { id?: string; title?: string },
): Promise<Assignment> {
  if (!hasSupabase()) return local.upsertAssignment(input);
  const sb = client();

  // Partial update — never wipe other columns with defaults
  if (input.id) {
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.courseId !== undefined) body.course_id = input.courseId;
    if (input.status !== undefined) body.status = input.status;
    if (input.dueAt !== undefined) body.due_at = input.dueAt;
    if (input.assignmentType !== undefined) {
      body.assignment_type = input.assignmentType;
    }
    if (input.difficulty !== undefined) body.difficulty = input.difficulty;
    if (input.pointsEarned !== undefined) {
      body.points_earned = input.pointsEarned;
    }
    if (input.pointsPossible !== undefined) {
      body.points_possible = input.pointsPossible;
    }
    if (input.notes !== undefined) body.notes = input.notes;
    if (input.link !== undefined) body.link = input.link;
    if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;
    if (input.dueReminderSentFor !== undefined) {
      body.due_reminder_sent_for = input.dueReminderSentFor;
    }
    const { data, error } = await sb
      .from("assignments")
      .update(body)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message || "Failed to update assignment");
    }
    return rowToAssignment(data as Record<string, unknown>);
  }

  if (!input.title?.trim()) {
    throw new Error("title required to create assignment");
  }
  const body: Record<string, unknown> = {
    title: input.title.trim(),
    course_id: input.courseId ?? null,
    status: input.status ?? "not_started",
    due_at: input.dueAt ?? null,
    assignment_type: input.assignmentType ?? "Homework",
    difficulty: input.difficulty ?? "medium",
    points_earned: input.pointsEarned ?? null,
    points_possible: input.pointsPossible ?? null,
    notes: input.notes ?? "",
    link: input.link ?? "",
    sort_order: input.sortOrder ?? 0,
    due_reminder_sent_for: input.dueReminderSentFor ?? null,
  };
  const { data, error } = await sb
    .from("assignments")
    .insert(body)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to save assignment");
  }
  return rowToAssignment(data as Record<string, unknown>);
}

export async function deleteAssignment(id: string): Promise<void> {
  if (!hasSupabase()) return local.deleteAssignment(id);
  const sb = client();
  await sb.from("assignments").delete().eq("id", id);
}

export async function bulkUpsertAssignments(
  rows: (Partial<Assignment> & { title?: string; id?: string })[],
): Promise<Assignment[]> {
  if (!hasSupabase()) return local.bulkUpsertAssignments(rows);
  const out: Assignment[] = [];
  for (const row of rows) out.push(await upsertAssignment(row));
  return out;
}
