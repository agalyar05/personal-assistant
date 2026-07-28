import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppSettings, ListItem, Reminder, Store } from "../types";
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
  return {
    ...DEFAULT_SETTINGS,
    ...(data.payload as AppSettings),
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
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
  };
}

export async function addListItems(
  listName: string,
  texts: string[],
): Promise<{ added: ListItem[]; skipped: string[] }> {
  if (!hasSupabase()) return local.addListItems(listName, texts);
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
  };
}
