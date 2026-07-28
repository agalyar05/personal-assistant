"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ListDifficulty, ListItem } from "@/lib/types";
import { CelebrationBurst } from "@/components/CelebrationBurst";

type ColumnId = ListDifficulty | "done";

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "done", label: "✅ Done" },
];

export default function TodoPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [newText, setNewText] = useState("");
  const [msg, setMsg] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ColumnId | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/lists?list=todo&all=1");
    const json = await res.json();
    setItems(
      (json.all || json.items || []).map((i: ListItem) => ({
        ...i,
        difficulty: i.difficulty || "medium",
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo(() => {
    return COLUMNS.map((col) => ({
      ...col,
      items:
        col.id === "done"
          ? items.filter((i) => i.checked)
          : items.filter((i) => !i.checked && i.difficulty === col.id),
    }));
  }, [items]);

  async function addTodo() {
    const parts = newText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_name: "todo", items: parts }),
    });
    const json = await res.json();
    setMsg(json.message || "Added");
    setNewText("");
    await load();
  }

  async function moveTo(id: string, column: ColumnId) {
    const prev = items.find((i) => i.id === id);
    const goingDone = column === "done";
    const wasDone = Boolean(prev?.checked);

    setItems((list) =>
      list.map((i) => {
        if (i.id !== id) return i;
        if (goingDone) return { ...i, checked: true };
        return {
          ...i,
          checked: false,
          difficulty: column as ListDifficulty,
        };
      }),
    );

    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        goingDone
          ? { action: "update", id, checked: true }
          : {
              action: "update",
              id,
              checked: false,
              difficulty: column,
            },
      ),
    });
    if (!res.ok) {
      setMsg("Move failed");
      await load();
      return;
    }
    if (goingDone && !wasDone) setCelebrate(true);
  }

  return (
    <div className="space-y-6">
      <CelebrationBurst
        open={celebrate}
        onDone={() => setCelebrate(false)}
        label="Todo done! ✅"
      />

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">.todo</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Drag cards across Easy / Medium / Hard / ✅ Done. Finishing one gets
          confetti.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addTodo();
            }}
            placeholder="Add a todo…"
            className="min-w-[220px] flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void addTodo()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            Add
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-[var(--muted)]">{msg}</p>}
      </section>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.id);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/todo-id") || dragId;
              if (id) void moveTo(id, col.id);
              setDragId(null);
              setOverCol(null);
            }}
            className={`w-72 shrink-0 rounded-2xl border p-3 ${
              overCol === col.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/50"
                : "border-[var(--line)] bg-[var(--card)]"
            }`}
          >
            <div className="mb-3 text-sm font-medium">
              {col.label}{" "}
              <span className="text-[var(--muted)]">({col.items.length})</span>
            </div>
            <div className="min-h-28 space-y-2">
              {col.items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(item.id);
                    e.dataTransfer.setData("text/todo-id", item.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  className={`cursor-grab rounded-xl border border-[var(--line)] bg-white/90 px-3 py-3 text-sm active:cursor-grabbing ${
                    item.checked
                      ? "bg-stone-100 text-[var(--muted)] line-through opacity-80"
                      : ""
                  } ${dragId === item.id ? "opacity-50" : ""}`}
                >
                  {item.checked ? "✅ " : ""}
                  {item.text}
                </div>
              ))}
              {!col.items.length && (
                <p className="py-8 text-center text-xs text-[var(--muted)]">
                  Drop here
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
