import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_STORE, type AppSettings, type ListItem, type Reminder, type Store } from "../types";

const DATA_PATH = path.join(process.cwd(), "data", "store.json");

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return {
      ...DEFAULT_STORE,
      ...parsed,
      settings: { ...DEFAULT_STORE.settings, ...parsed.settings },
      listItems: parsed.listItems || [],
      reminders: parsed.reminders || [],
      processedMessages: parsed.processedMessages || [],
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getSettings(): Promise<AppSettings> {
  return (await readStore()).settings;
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const store = await readStore();
  store.settings = {
    ...store.settings,
    ...patch,
    cronControl: {
      ...store.settings.cronControl,
      ...(patch.cronControl || {}),
    },
  };
  await writeStore(store);
  return store.settings;
}

export async function getListItems(listName?: string): Promise<ListItem[]> {
  const store = await readStore();
  const items = store.listItems.filter((i) => !listName || i.listName === listName);
  return items.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addListItems(
  listName: string,
  texts: string[],
): Promise<{ added: ListItem[]; skipped: string[] }> {
  const store = await readStore();
  const existing = store.listItems.filter(
    (i) => i.listName === listName && !i.checked,
  );
  const seen = new Set(existing.map((i) => i.text.toLowerCase()));
  const added: ListItem[] = [];
  const skipped: string[] = [];
  let order =
    store.listItems
      .filter((i) => i.listName === listName)
      .reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;

  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) {
      skipped.push(text);
      continue;
    }
    seen.add(key);
    const item: ListItem = {
      id: uid(),
      listName,
      text,
      checked: false,
      sortOrder: order++,
      createdAt: new Date().toISOString(),
    };
    store.listItems.push(item);
    added.push(item);
  }
  await writeStore(store);
  return { added, skipped };
}

export async function checkOffListItem(
  listName: string,
  itemOrIndex: string,
): Promise<ListItem | null> {
  const store = await readStore();
  const active = store.listItems
    .filter((i) => i.listName === listName && !i.checked)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  let target: ListItem | undefined;
  if (/^\d+$/.test(itemOrIndex.trim())) {
    target = active[parseInt(itemOrIndex.trim(), 10) - 1];
  } else {
    const needle = itemOrIndex.trim().toLowerCase();
    target = active.find((i) => i.text.toLowerCase() === needle);
  }
  if (!target) return null;
  target.checked = true;
  await writeStore(store);
  return target;
}

export async function removeListItems(
  listName: string,
  items: string[],
): Promise<string[]> {
  const store = await readStore();
  const removed: string[] = [];
  for (const target of items) {
    if (/^\d+$/.test(target.trim())) {
      const active = store.listItems
        .filter((i) => i.listName === listName && !i.checked)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const hit = active[parseInt(target.trim(), 10) - 1];
      if (hit) {
        store.listItems = store.listItems.filter((i) => i.id !== hit.id);
        removed.push(hit.text);
      }
      continue;
    }
    const needle = target.trim().toLowerCase();
    const hit = store.listItems.find(
      (i) =>
        i.listName === listName &&
        !i.checked &&
        i.text.toLowerCase() === needle,
    );
    if (hit) {
      store.listItems = store.listItems.filter((i) => i.id !== hit.id);
      removed.push(hit.text);
    }
  }
  await writeStore(store);
  return removed;
}

export async function clearList(listName: string): Promise<number> {
  const store = await readStore();
  const before = store.listItems.length;
  store.listItems = store.listItems.filter((i) => i.listName !== listName);
  await writeStore(store);
  return before - store.listItems.length;
}

export async function getReminders(): Promise<Reminder[]> {
  return (await readStore()).reminders.filter((r) => !r.sent);
}

export async function addReminder(
  reminder: Omit<Reminder, "id" | "createdAt" | "sent" | "lastSent" | "snoozedUntil"> &
    Partial<Pick<Reminder, "sent" | "lastSent" | "snoozedUntil">>,
): Promise<Reminder> {
  const store = await readStore();
  const row: Reminder = {
    id: uid(),
    createdAt: new Date().toISOString(),
    sent: false,
    lastSent: null,
    snoozedUntil: null,
    ...reminder,
  };
  store.reminders.push(row);
  await writeStore(store);
  return row;
}

export async function updateReminder(
  id: string,
  patch: Partial<Reminder>,
): Promise<Reminder | null> {
  const store = await readStore();
  const row = store.reminders.find((r) => r.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  await writeStore(store);
  return row;
}

export async function deleteRemindersMatching(search: string): Promise<number> {
  const store = await readStore();
  const needle = search.trim().toLowerCase();
  const before = store.reminders.length;
  store.reminders = store.reminders.filter(
    (r) => r.sent || !r.message.toLowerCase().includes(needle),
  );
  await writeStore(store);
  return before - store.reminders.length;
}

export async function wasProcessed(gmailMessageId: string): Promise<boolean> {
  const store = await readStore();
  return store.processedMessages.some((p) => p.gmailMessageId === gmailMessageId);
}

export async function markProcessed(
  gmailMessageId: string,
  threadId: string,
): Promise<void> {
  const store = await readStore();
  if (store.processedMessages.some((p) => p.gmailMessageId === gmailMessageId)) {
    return;
  }
  store.processedMessages.push({
    gmailMessageId,
    threadId,
    processedAt: new Date().toISOString(),
  });
  // keep last 500
  if (store.processedMessages.length > 500) {
    store.processedMessages = store.processedMessages.slice(-500);
  }
  await writeStore(store);
}

export async function getFullStore(): Promise<Store> {
  return readStore();
}
