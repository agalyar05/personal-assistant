"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ListDifficulty, ListItem } from "@/lib/types";
import { CelebrationBurst } from "@/components/CelebrationBurst";
import {
  kanbanBoardClass,
  kanbanBoardStyle,
  kanbanColumnBodyClass,
  kanbanColumnClass,
} from "@/lib/kanban-layout";

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
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overCol, setOverCol] = useState<ColumnId | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  async function moveMany(ids: string[], column: ColumnId) {
    const goingDone = column === "done";
    const anyNewlyDone = ids.some((id) => {
      const prev = items.find((i) => i.id === id);
      return goingDone && prev && !prev.checked;
    });

    setItems((list) =>
      list.map((i) => {
        if (!ids.includes(i.id)) return i;
        if (goingDone) return { ...i, checked: true };
        return {
          ...i,
          checked: false,
          difficulty: column as ListDifficulty,
        };
      }),
    );

    const results = await Promise.all(
      ids.map((id) =>
        fetch("/api/lists", {
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
        }),
      ),
    );
    if (results.some((r) => !r.ok)) {
      setMsg("Some moves failed");
      await load();
      return;
    }
    if (anyNewlyDone) setCelebrate(true);
    setSelected(new Set());
  }

  function selectCard(id: string, columnItems: ListItem[], e: React.MouseEvent) {
    e.stopPropagation();
    const ids = columnItems.map((i) => i.id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelected && ids.includes(lastSelected)) {
        const a = ids.indexOf(lastSelected);
        const b = ids.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) next.add(ids[i]!);
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else if (next.has(id) && next.size > 1) {
        // keep group for drag
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
    setLastSelected(id);
  }

  function idsToMove(primary: string): string[] {
    if (selected.has(primary) && selected.size > 0) {
      return Array.from(selected);
    }
    return [primary];
  }

  return (
    <div className="space-y-4">
      <CelebrationBurst
        open={celebrate}
        onDone={() => setCelebrate(false)}
        label="Todo done! ✅"
      />

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="display text-xl leading-tight">.todo</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Click · ⌘/Ctrl · Shift to select, then drag.
              {selected.size > 0 && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear {selected.size}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addTodo();
            }}
            placeholder="Add a todo…"
            className="min-w-[180px] flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
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

      <div className={kanbanBoardClass} style={kanbanBoardStyle(columns.length)}>
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
              let ids: string[] = [];
              try {
                const raw = e.dataTransfer.getData("text/todo-ids");
                if (raw) ids = JSON.parse(raw) as string[];
              } catch {
                /* ignore */
              }
              if (!ids.length) {
                const one =
                  e.dataTransfer.getData("text/todo-id") || dragIds[0];
                if (one) ids = [one];
              }
              if (ids.length) void moveMany(ids, col.id);
              setDragIds([]);
              setOverCol(null);
            }}
            className={`${kanbanColumnClass} ${
              overCol === col.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/50"
                : "border-[var(--line)] bg-[var(--card)]"
            }`}
          >
            <div className="mb-2 text-xs font-medium sm:text-sm">
              {col.label}{" "}
              <span className="text-[var(--muted)]">({col.items.length})</span>
            </div>
            <div className={kanbanColumnBodyClass}>
              {col.items.map((item) => {
                const isSel = selected.has(item.id);
                const isDragging = dragIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    draggable
                    onClick={(e) => selectCard(item.id, col.items, e)}
                    onDragStart={(e) => {
                      const ids = idsToMove(item.id);
                      setDragIds(ids);
                      e.dataTransfer.setData(
                        "text/todo-ids",
                        JSON.stringify(ids),
                      );
                      e.dataTransfer.setData("text/todo-id", item.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragIds([]);
                      setOverCol(null);
                    }}
                    className={`cursor-grab rounded-lg border px-2 py-2 text-xs active:cursor-grabbing sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm ${
                      isSel
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]/60 ring-2 ring-[var(--accent)]"
                        : "border-[var(--line)] bg-white/90"
                    } ${
                      item.checked
                        ? "bg-stone-100 text-[var(--muted)] line-through opacity-80"
                        : ""
                    } ${isDragging ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="leading-snug">
                        {item.checked ? "✅ " : ""}
                        {item.text}
                      </span>
                      {isSel && selected.size > 1 && (
                        <span className="shrink-0 text-[10px] text-[var(--accent)]">
                          {selected.size}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
