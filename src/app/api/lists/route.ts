import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as lists from "@/lib/lists";
import type { ListDifficulty } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("list") || undefined;
  const names = await db.getListNames();
  if (!name) {
    return NextResponse.json({
      provider: db.dbProvider(),
      names,
      items: [],
    });
  }
  const includeChecked = url.searchParams.get("all") === "1";
  const items = await db.getListItems(name);
  return NextResponse.json({
    provider: db.dbProvider(),
    names,
    items: includeChecked ? items : items.filter((i) => !i.checked),
    all: items,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    list_name?: string;
    new_name?: string;
    items?: string[];
    action?: string;
    id?: string;
    ids?: string[];
    checked?: boolean;
    difficulty?: ListDifficulty;
    text?: string;
    sortOrder?: number;
  };
  const listName = body.list_name || lists.DEFAULT_GROCERY;

  if (body.action === "names") {
    return NextResponse.json({ names: await db.getListNames() });
  }
  if (body.action === "create") {
    const names = await db.createList(lists.normalizeListName(listName));
    return NextResponse.json({ names });
  }
  if (body.action === "rename" && body.new_name) {
    const names = await db.renameList(
      lists.normalizeListName(listName),
      lists.normalizeListName(body.new_name),
    );
    return NextResponse.json({ names });
  }
  if (body.action === "delete") {
    const names = await db.deleteList(lists.normalizeListName(listName));
    return NextResponse.json({ names });
  }
  if (body.action === "clear") {
    const n = await db.clearList(lists.normalizeListName(listName));
    return NextResponse.json({ cleared: n });
  }
  if (body.action === "update" && body.id) {
    const item = await db.updateListItem(body.id, {
      checked: body.checked,
      difficulty: body.difficulty,
      text: body.text,
      sortOrder: body.sortOrder,
    });
    if (body.checked !== undefined && item) {
      const { syncAssignmentFromTodoCheck } = await import(
        "@/lib/masterlist-todo"
      );
      await syncAssignmentFromTodoCheck(body.id, Boolean(body.checked));
    }
    return NextResponse.json({ item });
  }
  if (body.action === "remove" && body.id) {
    await db.deleteListItem(body.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "reorder" && Array.isArray(body.ids)) {
    await Promise.all(
      body.ids.map((id, i) => db.updateListItem(id, { sortOrder: i + 1 })),
    );
    return NextResponse.json({ ok: true });
  }
  // Plain add — optionally land new items directly in a Kanban column.
  const name = lists.normalizeListName(listName) || lists.DEFAULT_GROCERY;
  const { added, skipped } = await db.addListItems(name, body.items || []);
  if (added.length && (body.difficulty || body.checked)) {
    await Promise.all(
      added.map((item) =>
        db.updateListItem(item.id, {
          difficulty: body.difficulty,
          checked: body.checked,
        }),
      ),
    );
  }
  const message = lists.formatAddConfirmation(
    `.${name}`,
    added.map((a) => a.text),
    skipped,
  );
  return NextResponse.json({ message, names: await db.getListNames() });
}
