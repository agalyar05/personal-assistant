"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  listName: string;
  text: string;
  checked: boolean;
};

export default function ListsPage() {
  const [names, setNames] = useState<string[]>([]);
  const [listName, setListName] = useState("todo");
  const [items, setItems] = useState<Item[]>([]);
  const [newItems, setNewItems] = useState("");
  const [newList, setNewList] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [msg, setMsg] = useState("");

  async function loadNames(preferred?: string) {
    const res = await fetch("/api/lists");
    const json = await res.json();
    const next: string[] = json.names || [];
    setNames(next);
    const pick =
      preferred && next.includes(preferred)
        ? preferred
        : next.includes(listName)
          ? listName
          : next[0] || "todo";
    setListName(pick);
    return pick;
  }

  async function loadItems(name = listName) {
    const res = await fetch(`/api/lists?list=${encodeURIComponent(name)}`);
    const json = await res.json();
    if (json.names) setNames(json.names);
    setItems(json.items || []);
  }

  useEffect(() => {
    void (async () => {
      const pick = await loadNames();
      await loadItems(pick);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listName) void loadItems(listName);
    setRenameTo(listName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (json.names) setNames(json.names);
    await loadItems(listName);
  }

  async function clear() {
    if (!confirm(`Clear .${listName}?`)) return;
    await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_name: listName, action: "clear" }),
    });
    await loadItems(listName);
  }

  async function createList() {
    const name = newList.trim().toLowerCase().replace(/^\./, "");
    if (!name) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_name: name, action: "create" }),
    });
    const json = await res.json();
    setNames(json.names || []);
    setNewList("");
    setListName(name);
    setMsg(`Created .${name}`);
  }

  async function renameList() {
    const next = renameTo.trim().toLowerCase().replace(/^\./, "");
    if (!next || next === listName) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        list_name: listName,
        new_name: next,
        action: "rename",
      }),
    });
    const json = await res.json();
    setNames(json.names || []);
    setListName(next);
    setMsg(`Renamed to .${next}`);
  }

  async function deleteList() {
    if (!confirm(`Delete .${listName} and all its items?`)) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_name: listName, action: "delete" }),
    });
    const json = await res.json();
    const next: string[] = json.names || [];
    setNames(next);
    setListName(next[0] || "todo");
    setMsg("List deleted");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">Lists</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          All lists from your dashboard, plus any you create here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setListName(n)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                listName === n
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white"
              }`}
            >
              .{n}
            </button>
          ))}
          {!names.length && (
            <span className="text-sm text-[var(--muted)]">No lists yet</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={newList}
            onChange={(e) => setNewList(e.target.value)}
            placeholder="New list name"
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createList()}
            className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm text-white"
          >
            Create list
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void renameList()}
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => void deleteList()}
            className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700"
          >
            Delete list
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h3 className="display text-xl">.{listName}</h3>
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
              onClick={() => void add()}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => void clear()}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
            >
              Clear items
            </button>
          </div>
          {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}
        </div>
      </section>
    </div>
  );
}
