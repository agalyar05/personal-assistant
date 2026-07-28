import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_STORE,
  type AppSettings,
  type Assignment,
  type AssignmentDifficulty,
  type AssignmentStatus,
  type Course,
  type ListItem,
  type Reminder,
  type Store,
} from "../types";

const DATA_PATH = path.join(process.cwd(), "data", "store.json");

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      ...DEFAULT_STORE,
      ...parsed,
      settings: {
        ...DEFAULT_STORE.settings,
        ...parsed.settings,
        cronControl: {
          ...DEFAULT_STORE.settings.cronControl,
          ...(parsed.settings?.cronControl || {}),
        },
        uiTheme: {
          ...DEFAULT_STORE.settings.uiTheme,
          ...(parsed.settings?.uiTheme || {}),
          custom: {
            ...DEFAULT_STORE.settings.uiTheme.custom,
            ...(parsed.settings?.uiTheme?.custom || {}),
          },
        },
        listCatalog:
          parsed.settings?.listCatalog?.length
            ? parsed.settings.listCatalog
            : DEFAULT_STORE.settings.listCatalog,
        dashboardLayout:
          parsed.settings?.dashboardLayout?.widgets?.length
            ? parsed.settings.dashboardLayout
            : DEFAULT_STORE.settings.dashboardLayout,
      },
      listItems: (parsed.listItems || []).map((i) => ({
        ...i,
        difficulty: i.difficulty || "medium",
      })),
      reminders: parsed.reminders || [],
      processedMessages: parsed.processedMessages || [],
      courses: (parsed.courses || []).map((c) => ({
        ...c,
        links: Array.isArray(c.links) ? c.links : [],
      })),
      assignments: (parsed.assignments || []).map((a) => ({
        ...a,
        link: a.link || "",
      })),
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
    uiTheme: {
      ...store.settings.uiTheme,
      ...(patch.uiTheme || {}),
      custom: {
        ...store.settings.uiTheme.custom,
        ...(patch.uiTheme?.custom || {}),
      },
    },
    dashboardLayout: patch.dashboardLayout ?? store.settings.dashboardLayout,
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
  if (!store.settings.listCatalog.includes(listName)) {
    store.settings.listCatalog = [...store.settings.listCatalog, listName].sort();
  }
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
      difficulty: "medium",
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

export async function updateListItem(
  id: string,
  patch: Partial<Pick<ListItem, "checked" | "difficulty" | "text" | "sortOrder">>,
): Promise<ListItem | null> {
  const store = await readStore();
  const idx = store.listItems.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  store.listItems[idx] = { ...store.listItems[idx]!, ...patch };
  await writeStore(store);
  return store.listItems[idx]!;
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

export async function getListNames(): Promise<string[]> {
  const store = await readStore();
  const names = new Set<string>([
    ...store.settings.listCatalog,
    ...store.listItems.map((i) => i.listName),
  ]);
  return [...names].filter(Boolean).sort();
}

export async function createList(listName: string): Promise<string[]> {
  const store = await readStore();
  const name = listName.trim().toLowerCase();
  if (!name) return getListNames();
  store.settings.listCatalog = Array.from(
    new Set([...(store.settings.listCatalog || []), name]),
  ).sort();
  await writeStore(store);
  return getListNames();
}

export async function renameList(from: string, to: string): Promise<string[]> {
  const store = await readStore();
  const oldName = from.trim().toLowerCase();
  const newName = to.trim().toLowerCase();
  if (!oldName || !newName || oldName === newName) return getListNames();
  for (const item of store.listItems) {
    if (item.listName === oldName) item.listName = newName;
  }
  store.settings.listCatalog = Array.from(
    new Set(
      (store.settings.listCatalog || [])
        .map((n) => (n === oldName ? newName : n))
        .concat(newName),
    ),
  ).sort();
  await writeStore(store);
  return getListNames();
}

export async function deleteList(listName: string): Promise<string[]> {
  const store = await readStore();
  const name = listName.trim().toLowerCase();
  store.listItems = store.listItems.filter((i) => i.listName !== name);
  store.settings.listCatalog = (store.settings.listCatalog || []).filter(
    (n) => n !== name,
  );
  await writeStore(store);
  return getListNames();
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

export async function getCourses(): Promise<Course[]> {
  const store = await readStore();
  return [...store.courses].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function upsertCourse(
  input: Partial<Course> & { name: string },
): Promise<Course> {
  const store = await readStore();
  if (input.id) {
    const idx = store.courses.findIndex((c) => c.id === input.id);
    if (idx >= 0) {
      store.courses[idx] = { ...store.courses[idx]!, ...input };
      await writeStore(store);
      return store.courses[idx]!;
    }
  }
  const course: Course = {
    id: input.id || uid(),
    name: input.name,
    code: input.code || "",
    color: input.color || "#0f766e",
    professor: input.professor || "",
    schedule: input.schedule || "",
    links: input.links || [],
    sortOrder:
      input.sortOrder ??
      store.courses.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
    createdAt: new Date().toISOString(),
  };
  store.courses.push(course);
  await writeStore(store);
  return course;
}

export async function deleteCourse(id: string): Promise<void> {
  const store = await readStore();
  store.courses = store.courses.filter((c) => c.id !== id);
  for (const a of store.assignments) {
    if (a.courseId === id) a.courseId = null;
  }
  await writeStore(store);
}

export async function getAssignments(): Promise<Assignment[]> {
  const store = await readStore();
  return [...store.assignments].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.dueAt || "").localeCompare(String(b.dueAt || ""));
  });
}

export async function upsertAssignment(
  input: Partial<Assignment> & { id?: string; title?: string },
): Promise<Assignment> {
  const store = await readStore();
  if (input.id) {
    const idx = store.assignments.findIndex((a) => a.id === input.id);
    if (idx >= 0) {
      store.assignments[idx] = { ...store.assignments[idx]!, ...input };
      await writeStore(store);
      return store.assignments[idx]!;
    }
  }
  if (!input.title?.trim()) {
    throw new Error("title required to create assignment");
  }
  const row: Assignment = {
    id: input.id || uid(),
    courseId: input.courseId ?? null,
    title: input.title.trim(),
    status: (input.status as AssignmentStatus) || "not_started",
    dueAt: input.dueAt ?? null,
    assignmentType: input.assignmentType || "Homework",
    difficulty: (input.difficulty as AssignmentDifficulty) || "medium",
    pointsEarned: input.pointsEarned ?? null,
    pointsPossible: input.pointsPossible ?? null,
    notes: input.notes || "",
    link: input.link || "",
    sortOrder:
      input.sortOrder ??
      store.assignments.reduce((m, a) => Math.max(m, a.sortOrder), 0) + 1,
    dueReminderSentFor: input.dueReminderSentFor ?? null,
    createdAt: new Date().toISOString(),
  };
  store.assignments.push(row);
  await writeStore(store);
  return row;
}

export async function deleteAssignment(id: string): Promise<void> {
  const store = await readStore();
  store.assignments = store.assignments.filter((a) => a.id !== id);
  await writeStore(store);
}

export async function bulkUpsertAssignments(
  rows: (Partial<Assignment> & { title?: string; id?: string })[],
): Promise<Assignment[]> {
  const out: Assignment[] = [];
  for (const row of rows) out.push(await upsertAssignment(row));
  return out;
}
