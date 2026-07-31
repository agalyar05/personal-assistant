import * as db from "./db";
import type { Assignment, AssignmentStatus, ListItem } from "./types";

const TODO_LIST = "todo";

/** Create or remove the linked .todo item for a Masterlist row. */
export async function setAssignmentOnTodo(
  assignment: Assignment,
  onTodo: boolean,
): Promise<Assignment> {
  if (onTodo) {
    if (assignment.todoItemId) {
      const items = await db.getListItems(TODO_LIST);
      const existing = items.find((i) => i.id === assignment.todoItemId);
      if (existing) {
        if (existing.text !== assignment.title) {
          await db.updateListItem(existing.id, { text: assignment.title });
        }
        const shouldCheck =
          assignment.status === "submitted" ||
          assignment.status === "complete";
        if (existing.checked !== shouldCheck) {
          await db.updateListItem(existing.id, { checked: shouldCheck });
        }
        return assignment;
      }
    }

    const { added, skipped } = await db.addListItems(TODO_LIST, [
      assignment.title || "Untitled",
    ]);
    let item: ListItem | undefined = added[0];
    if (!item && skipped.length) {
      // Already on .todo — reuse matching open item
      const items = await db.getListItems(TODO_LIST);
      item =
        items.find(
          (i) =>
            i.text.toLowerCase() === assignment.title.trim().toLowerCase() &&
            !i.checked,
        ) ||
        items.find(
          (i) =>
            i.text.toLowerCase() === assignment.title.trim().toLowerCase(),
        );
    }
    if (!item) return assignment;

    const shouldCheck =
      assignment.status === "submitted" || assignment.status === "complete";
    if (shouldCheck) {
      await db.updateListItem(item.id, { checked: true });
    }
    return db.upsertAssignment({
      id: assignment.id,
      title: assignment.title,
      todoItemId: item.id,
    });
  }

  if (assignment.todoItemId) {
    try {
      await db.deleteListItem(assignment.todoItemId);
    } catch {
      /* ignore */
    }
  }
  return db.upsertAssignment({
    id: assignment.id,
    title: assignment.title,
    todoItemId: null,
  });
}

/** When .todo checked flips, mirror Masterlist status. */
export async function syncAssignmentFromTodoCheck(
  listItemId: string,
  checked: boolean,
): Promise<Assignment | null> {
  const all = await db.getAssignments();
  const a = all.find((x) => x.todoItemId === listItemId);
  if (!a) return null;
  if (checked) {
    if (a.status === "submitted" || a.status === "complete") return a;
    return db.upsertAssignment({
      id: a.id,
      title: a.title,
      status: "submitted" as AssignmentStatus,
    });
  }
  if (a.status === "submitted") {
    return db.upsertAssignment({
      id: a.id,
      title: a.title,
      status: "in_progress",
    });
  }
  return a;
}

/** When Masterlist status changes, mirror .todo checked. */
export async function syncTodoFromAssignmentStatus(
  assignment: Assignment,
  status: AssignmentStatus,
): Promise<void> {
  if (!assignment.todoItemId) return;
  const done = status === "submitted" || status === "complete";
  await db.updateListItem(assignment.todoItemId, { checked: done });
}
