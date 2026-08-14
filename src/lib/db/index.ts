import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  Application,
  ApplicationKind,
  ApplicationStatus,
  Assignment,
  AssignmentDifficulty,
  AssignmentStatus,
  Course,
  CourseLink,
  CronControlSettings,
  ListItem,
  Reminder,
  Store,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import {
  APPLICATIONS_GROUP_CODE,
  DEFAULT_APPLICATIONS_GROUP,
  isApplicationsGroup,
} from "../courses";
import * as local from "./local";

function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
  );
}

let cachedClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/** Prefer Supabase when configured; otherwise local JSON file. */
export function dbProvider(): "supabase" | "local" {
  return hasSupabase() ? "supabase" : "local";
}

/**
 * Just the cron gate — avoids pulling the full settings JSONB blob (which can carry
 * dashboard image data URLs and the whole thinking sheet) on every cron tick just to
 * check whether this tick should no-op.
 */
export async function getCronControl(): Promise<CronControlSettings> {
  if (!hasSupabase()) return (await local.getSettings()).cronControl;
  const sb = client();
  const { data, error } = await sb
    .from("app_settings")
    .select("payload->cronControl")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS.cronControl;
  const raw = (data as { cronControl?: Partial<CronControlSettings> })
    .cronControl;
  return { ...DEFAULT_SETTINGS.cronControl, ...(raw || {}) };
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
    thinkingSheet: {
      colCount: Math.max(
        4,
        Math.min(52, Number(payload.thinkingSheet?.colCount) || 12),
      ),
      rowCount: Math.max(
        5,
        Math.min(200, Number(payload.thinkingSheet?.rowCount) || 30),
      ),
      cells: (payload.thinkingSheet?.cells || {}) as Record<string, string>,
    },
    taskHorizonDays: Math.max(
      0,
      Math.min(365, Number(payload.taskHorizonDays ?? DEFAULT_SETTINGS.taskHorizonDays)),
    ),
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
    thinkingSheet: patch.thinkingSheet ?? current.thinkingSheet,
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
    difficulty: (String(row.difficulty || "unassigned") as ListItem["difficulty"]),
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
        difficulty: "unassigned",
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

export async function deleteListItem(id: string): Promise<void> {
  if (!hasSupabase()) return local.deleteListItem(id);
  const sb = client();
  await sb.from("list_items").delete().eq("id", id);
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

export async function deleteReminder(id: string): Promise<void> {
  if (!hasSupabase()) return local.deleteReminder(id);
  const sb = client();
  await sb.from("reminders").delete().eq("id", id);
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
    applications: await getApplications(),
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
    todoItemId: row.todo_item_id ? String(row.todo_item_id) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function getCourses(): Promise<Course[]> {
  if (!hasSupabase()) return local.getCourses();
  const sb = client();
  const { data } = await sb.from("courses").select("*").order("sort_order");
  let courses = (data || []).map((r) => rowToCourse(r as Record<string, unknown>));
  courses = await ensureApplicationsGroupAmong(courses);
  return courses;
}

async function ensureApplicationsGroupAmong(courses: Course[]): Promise<Course[]> {
  if (courses.some(isApplicationsGroup)) return courses;
  const created = await upsertCourse({
    ...DEFAULT_APPLICATIONS_GROUP,
    code: APPLICATIONS_GROUP_CODE,
  });
  return [...courses, created].sort((a, b) => a.sortOrder - b.sortOrder);
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
  const courses = await getCourses();
  const target = courses.find((c) => c.id === id);
  if (target) {
    if (isApplicationsGroup(target)) {
      throw new Error("Cannot delete the Applications group");
    }
  }
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

/** Only the columns actually present in `input` — never wipes others with defaults. */
function assignmentUpdateBody(
  input: Partial<Assignment>,
): Record<string, unknown> {
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
  if (input.todoItemId !== undefined) {
    body.todo_item_id = input.todoItemId;
  }
  return body;
}

function assignmentInsertBody(
  input: Partial<Assignment> & { title: string },
): Record<string, unknown> {
  return {
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
    todo_item_id: input.todoItemId ?? null,
  };
}

export async function upsertAssignment(
  input: Partial<Assignment> & { id?: string; title?: string },
): Promise<Assignment> {
  if (!hasSupabase()) return local.upsertAssignment(input);
  const sb = client();

  if (input.id) {
    const { data, error } = await sb
      .from("assignments")
      .update(assignmentUpdateBody(input))
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
  const { data, error } = await sb
    .from("assignments")
    .insert(assignmentInsertBody(input as Partial<Assignment> & { title: string }))
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
  if (!rows.length) return [];
  const sb = client();
  const results: Assignment[] = new Array(rows.length);

  const insertIdxs: number[] = [];
  const updateIdxs: number[] = [];
  rows.forEach((r, i) => (r.id ? updateIdxs.push(i) : insertIdxs.push(i)));

  if (insertIdxs.length) {
    const body = insertIdxs.map((i) => {
      const r = rows[i]!;
      if (!r.title?.trim()) {
        throw new Error("title required to create assignment");
      }
      return assignmentInsertBody(r as Partial<Assignment> & { title: string });
    });
    const { data, error } = await sb
      .from("assignments")
      .insert(body)
      .select("*");
    if (error || !data || data.length !== insertIdxs.length) {
      throw new Error(error?.message || "Failed to save assignments");
    }
    insertIdxs.forEach((rowIdx, j) => {
      results[rowIdx] = rowToAssignment(data[j] as Record<string, unknown>);
    });
  }

  if (updateIdxs.length) {
    // upsert() validates the INSERT side of its INSERT..ON CONFLICT statement even
    // when the conflict path is the one that actually runs, so every body must
    // satisfy `title text not null` regardless of whether this patch touches it.
    // Backfill it from the DB for rows that didn't already provide it.
    const needsTitle = updateIdxs.filter((i) => rows[i]!.title === undefined);
    const titleById = new Map<string, string>();
    if (needsTitle.length) {
      const ids = needsTitle.map((i) => rows[i]!.id!);
      const { data, error } = await sb
        .from("assignments")
        .select("id,title")
        .in("id", ids);
      if (error) {
        throw new Error(error.message || "Failed to load titles for bulk update");
      }
      for (const row of data || []) {
        titleById.set(row.id as string, row.title as string);
      }
    }

    // Group by identical column set — upsert() builds one INSERT ... ON CONFLICT
    // statement per call, so mixing shapes in one request would null out columns
    // that some rows in the batch omit but siblings specify.
    const groups = new Map<string, number[]>();
    for (const rowIdx of updateIdxs) {
      const sig = Object.keys(rows[rowIdx]!)
        .filter((k) => k !== "id")
        .sort()
        .join(",");
      const list = groups.get(sig) || [];
      list.push(rowIdx);
      groups.set(sig, list);
    }
    for (const idxs of groups.values()) {
      const body = idxs.map((i) => {
        const r = rows[i]!;
        const title = r.title ?? titleById.get(r.id!);
        return { id: r.id, ...assignmentUpdateBody(r), ...(title !== undefined ? { title } : {}) };
      });
      const { data, error } = await sb
        .from("assignments")
        .upsert(body)
        .select("*");
      if (error || !data) {
        throw new Error(error?.message || "Failed to update assignments");
      }
      const byId = new Map(
        (data as Record<string, unknown>[]).map((d) => [d.id as string, d]),
      );
      idxs.forEach((rowIdx) => {
        const raw = byId.get(rows[rowIdx]!.id!);
        if (raw) results[rowIdx] = rowToAssignment(raw);
      });
    }
  }

  return results;
}

// --- Applications ---

function rowToApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    title: String(row.title),
    kind: String(row.kind || "scholarship") as ApplicationKind,
    status: String(row.status || "idea") as ApplicationStatus,
    url: String(row.url || ""),
    description: String(row.description || ""),
    deadline: row.deadline ? String(row.deadline) : null,
    remindAt: row.remind_at ? String(row.remind_at) : null,
    reminderId: row.reminder_id ? String(row.reminder_id) : null,
    notes: String(row.notes || ""),
    sortOrder: Number(row.sort_order || 0),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function getApplications(): Promise<Application[]> {
  if (!hasSupabase()) return local.getApplications();
  const sb = client();
  const { data, error } = await sb
    .from("applications")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data || [])
    .map((r) => rowToApplication(r as Record<string, unknown>))
    .sort((a, b) => {
      const ad = a.deadline || "9999";
      const bd = b.deadline || "9999";
      if (ad !== bd) return ad.localeCompare(bd);
      return a.sortOrder - b.sortOrder;
    });
}

export async function upsertApplication(
  input: Partial<Application> & { title: string },
): Promise<Application> {
  if (!hasSupabase()) return local.upsertApplication(input);
  const sb = client();
  if (input.id) {
    const body: Record<string, unknown> = { title: input.title };
    if (input.kind !== undefined) body.kind = input.kind;
    if (input.status !== undefined) body.status = input.status;
    if (input.url !== undefined) body.url = input.url;
    if (input.description !== undefined) body.description = input.description;
    if (input.deadline !== undefined) body.deadline = input.deadline;
    if (input.remindAt !== undefined) body.remind_at = input.remindAt;
    if (input.reminderId !== undefined) body.reminder_id = input.reminderId;
    if (input.notes !== undefined) body.notes = input.notes;
    if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;
    const { data, error } = await sb
      .from("applications")
      .update(body)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to update application");
    return rowToApplication(data as Record<string, unknown>);
  }
  const { data, error } = await sb
    .from("applications")
    .insert({
      title: input.title,
      kind: input.kind ?? "scholarship",
      status: input.status ?? "idea",
      url: input.url ?? "",
      description: input.description ?? "",
      deadline: input.deadline ?? null,
      remind_at: input.remindAt ?? null,
      reminder_id: input.reminderId ?? null,
      notes: input.notes ?? "",
      sort_order: input.sortOrder ?? 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to save application");
  return rowToApplication(data as Record<string, unknown>);
}

export async function deleteApplication(id: string): Promise<void> {
  if (!hasSupabase()) return local.deleteApplication(id);
  const sb = client();
  const { data } = await sb
    .from("applications")
    .select("reminder_id")
    .eq("id", id)
    .maybeSingle();
  const reminderId = data?.reminder_id ? String(data.reminder_id) : null;
  await sb.from("applications").delete().eq("id", id);
  if (reminderId) await deleteReminder(reminderId);
}
