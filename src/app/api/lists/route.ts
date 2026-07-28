import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as lists from "@/lib/lists";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("list") || undefined;
  const items = await db.getListItems(name);
  return NextResponse.json({
    provider: db.dbProvider(),
    items: items.filter((i) => !i.checked),
    all: items,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    list_name?: string;
    items?: string[];
    action?: string;
  };
  const listName = body.list_name || lists.DEFAULT_GROCERY;
  if (body.action === "clear") {
    const n = await db.clearList(lists.normalizeListName(listName));
    return NextResponse.json({ cleared: n });
  }
  const msg = await lists.addToList(listName, body.items || []);
  return NextResponse.json({ message: msg });
}
