"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  listName: string;
  text: string;
  checked: boolean;
};

export default function ListsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [listName, setListName] = useState("todo");
  const [newItems, setNewItems] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch(`/api/lists?list=${encodeURIComponent(listName)}`);
    const json = await res.json();
    setItems(json.items || []);
  }

  useEffect(() => {
    load();
  }, [listName]);

  async function add() {
    const parts = newItems
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_name: listName, items: parts }),
    });
    const json = await res.json();
    setMsg(json.message || "");
    setNewItems("");
    load();
  }

  async function clear() {
    if (!confirm(`Clear .${listName}?`)) return;
    await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_name: listName, action: "clear" }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">Lists</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {["todo", "groceries", "notes", "bhangra"].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setListName(n)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                listName === n
                  ? "bg-teal-800 text-white"
                  : "border border-[var(--line)] bg-white"
              }`}
            >
              .{n}
            </button>
          ))}
        </div>
        <ul className="mt-6 space-y-2">
          {items.length === 0 && (
            <li className="text-sm text-[var(--muted)]">List is empty.</li>
          )}
          {items.map((item, i) => (
            <li
              key={item.id}
              className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm"
            >
              {i + 1}. {item.text}
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-3">
          <textarea
            value={newItems}
            onChange={(e) => setNewItems(e.target.value)}
            placeholder="Add items (comma or newline separated)"
            className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={add}
              className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-medium text-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
            >
              Clear list
            </button>
          </div>
          {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}
        </div>
      </section>
    </div>
  );
}
