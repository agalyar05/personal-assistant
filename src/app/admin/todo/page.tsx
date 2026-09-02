"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ListDifficulty, ListItem } from "@/lib/types";
import { CelebrationBurst } from "@/components/CelebrationBurst";
import { UndoToast } from "@/components/UndoToast";
import {
  applyColumnOrder,
  KANBAN_COLUMN_DRAG_TYPE,
  kanbanBoardClass,
  kanbanBoardStyle,
  kanbanColumnBodyClass,
  kanbanColumnClass,
  reorderColumnIds,
} from "@/lib/kanban-layout";
import { useUndoToast } from "@/lib/useUndoToast";

type ColumnId = ListDifficulty | "done";

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "unassigned", label: "Unassigned" },
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "done", label: "✅ Done" },
];

function bySort(a: ListItem, b: ListItem) {
  return a.sortOrder - b.sortOrder || a.text.localeCompare(b.text);
}

function inColumn(i: ListItem, column: ColumnId) {
  if (column === "done") return i.checked;
  return !i.checked && i.difficulty === column;
}

export default function TodoPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [colText, setColText] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const { pending: undoPending, offerUndo, runUndo, dismiss: dismissUndo } =
    useUndoToast();
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overCol, setOverCol] = useState<ColumnId | null>(null);
  const [overItemId, setOverItemId] = useState<string | null>(null);
  const [colOrder, setColOrder] = useState<string[] | undefined>(undefined);
  const [dragColId, setDragColId] = useState<ColumnId | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/lists?list=todo&all=1");
    const json = await res.json();
    setItems(
      (json.all || json.items || []).map((i: ListItem) => ({
        ...i,
        difficulty: i.difficulty || "unassigned",
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings?slim=1");
      const json = await res.json();
      setColOrder(json.settings?.kanbanColumnOrder?.todo);
    })();
  }, []);

  async function saveColumnOrder(order: string[]) {
    setColOrder(order);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kanbanColumnOrder: { todo: order } }),
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelected(new Set());
        setMenu(null);
        setEditId(null);
      }
    }
    function onClick() {
      setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  const columns = useMemo(() => {
    const orderedIds = applyColumnOrder(
      COLUMNS.map((c) => c.id),
      colOrder,
    );
    return orderedIds.map((id) => {
      const col = COLUMNS.find((c) => c.id === id)!;
      return {
        ...col,
        items: items.filter((i) => inColumn(i, col.id)).sort(bySort),
      };
    });
  }, [items, colOrder]);

  async function addTodoToColumn(colId: ColumnId) {
    const raw = colText[colId] || "";
    const parts = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const body: Record<string, unknown> = { list_name: "todo", items: parts };
    if (colId === "done") body.checked = true;
    else body.difficulty = colId;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMsg(json.message || "Added");
    setColText((prev) => ({ ...prev, [colId]: "" }));
    await load();
  }

  async function moveMany(
    ids: string[],
    column: ColumnId,
    beforeId?: string | null,
  ) {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const goingDone = column === "done";
    const anyNewlyDone = ids.some((id) => {
      const prev = items.find((i) => i.id === id);
      return goingDone && prev && !prev.checked;
    });

    const moved = items
      .filter((i) => idSet.has(i.id))
      .map((i) =>
        goingDone
          ? { ...i, checked: true }
          : {
              ...i,
              checked: false,
              difficulty: column as ListDifficulty,
            },
      );

    const others = items.filter((i) => !idSet.has(i.id));
    const colOthers = others.filter((i) => inColumn(i, column)).sort(bySort);
    const anchor =
      beforeId && !idSet.has(beforeId)
        ? colOthers.findIndex((i) => i.id === beforeId)
        : -1;
    const at = anchor >= 0 ? anchor : colOthers.length;
    const newCol = [
      ...colOthers.slice(0, at),
      ...moved,
      ...colOthers.slice(at),
    ].map((i, idx) => ({ ...i, sortOrder: idx + 1 }));

    const rest = others.filter((i) => !inColumn(i, column));
    setItems([...rest, ...newCol]);

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

    await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        ids: newCol.map((i) => i.id),
      }),
    });

    if (anyNewlyDone) setCelebrate(true);
    setSelected(new Set());
  }

  /** Re-adds items verbatim, grouped by (checked, difficulty) to minimize round-trips. */
  async function restoreItems(snapshot: ListItem[]) {
    const groups = new Map<string, ListItem[]>();
    for (const item of snapshot) {
      const sig = item.checked ? "checked" : `d:${item.difficulty}`;
      const list = groups.get(sig) || [];
      list.push(item);
      groups.set(sig, list);
    }
    for (const group of groups.values()) {
      const first = group[0]!;
      const body: Record<string, unknown> = {
        list_name: "todo",
        items: group.map((i) => i.text),
      };
      if (first.checked) body.checked = true;
      else if (first.difficulty && first.difficulty !== "unassigned") {
        body.difficulty = first.difficulty;
      }
      await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    await load();
    setMsg("Restored");
  }

  async function clearAll() {
    const snapshot = items;
    if (!snapshot.length) return;
    await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_name: "todo", action: "clear" }),
    });
    setItems([]);
    setMsg("Cleared .todo");
    offerUndo(`Cleared .todo (${snapshot.length} items)`, () =>
      void restoreItems(snapshot),
    );
  }

  async function clearDone() {
    const doneItems = items.filter((i) => i.checked);
    if (!doneItems.length) return;
    await Promise.all(
      doneItems.map((i) =>
        fetch("/api/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", id: i.id }),
        }),
      ),
    );
    setItems((prev) => prev.filter((i) => !i.checked));
    setMsg(`Cleared ${doneItems.length} done item(s)`);
    offerUndo(`Cleared ${doneItems.length} done item(s)`, () =>
      void restoreItems(doneItems),
    );
  }

  async function deleteItem(id: string) {
    const snapshot = items.find((i) => i.id === id);
    await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (snapshot) {
      offerUndo(`Deleted "${snapshot.text}"`, () => void restoreItems([snapshot]));
    }
  }

  async function renameItem(id: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, text: trimmed } : i)),
    );
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, text: trimmed }),
    });
    if (!res.ok) {
      setMsg("Rename failed");
      await load();
    }
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
              Double-click to edit · right-click to delete · drag to move.
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
          <button
            type="button"
            onClick={() => void clearAll()}
            className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-red-300 hover:text-red-700"
          >
            Clear list
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
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
              const draggedCol = e.dataTransfer.getData(KANBAN_COLUMN_DRAG_TYPE);
              if (draggedCol) {
                const next = reorderColumnIds(
                  columns.map((c) => c.id),
                  draggedCol as ColumnId,
                  col.id,
                );
                void saveColumnOrder(next);
                setDragColId(null);
                setOverCol(null);
                return;
              }
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
              if (ids.length) void moveMany(ids, col.id, overItemId);
              setDragIds([]);
              setOverCol(null);
              setOverItemId(null);
            }}
            className={`${kanbanColumnClass} ${
              overCol === col.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/50"
                : "border-[var(--line)] bg-[var(--card)]"
            } ${dragColId === col.id ? "opacity-50" : ""}`}
          >
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(KANBAN_COLUMN_DRAG_TYPE, col.id);
                e.dataTransfer.effectAllowed = "move";
                setDragColId(col.id);
              }}
              onDragEnd={() => {
                setDragColId(null);
                setOverCol(null);
              }}
              className="mb-2 flex shrink-0 cursor-grab items-center justify-between gap-1 text-xs font-medium active:cursor-grabbing sm:text-sm"
              title="Drag to reorder columns"
            >
              <span>
                {col.label}{" "}
                <span className="text-[var(--muted)]">({col.items.length})</span>
              </span>
              {col.id === "done" && col.items.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void clearDone();
                  }}
                  className="shrink-0 text-[10px] font-normal text-[var(--muted)] underline hover:text-red-700"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              value={colText[col.id] || ""}
              onChange={(e) =>
                setColText((prev) => ({ ...prev, [col.id]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") void addTodoToColumn(col.id);
              }}
              placeholder="+ Add"
              className="mb-2 w-full shrink-0 rounded-lg border border-dashed border-[var(--line)] bg-white/60 px-2 py-1 text-xs outline-none focus:border-[var(--accent)] sm:text-sm"
            />
            <div className={kanbanColumnBodyClass}>
              {col.items.map((item) => {
                const isSel = selected.has(item.id);
                const isDragging = dragIds.includes(item.id);
                const isEditing = editId === item.id;
                return (
                  <div
                    key={item.id}
                    draggable={!isEditing}
                    onClick={(e) => {
                      if (isEditing) return;
                      selectCard(item.id, col.items, e);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setMenu(null);
                      setEditId(item.id);
                      setEditText(item.text);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(new Set([item.id]));
                      setLastSelected(item.id);
                      setMenu({ id: item.id, x: e.clientX, y: e.clientY });
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOverCol(col.id);
                      setOverItemId(item.id);
                    }}
                    onDragLeave={() =>
                      setOverItemId((id) => (id === item.id ? null : id))
                    }
                    onDragStart={(e) => {
                      if (isEditing) {
                        e.preventDefault();
                        return;
                      }
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
                      setOverItemId(null);
                    }}
                    className={`cursor-grab rounded-lg border px-2 py-2 text-xs active:cursor-grabbing sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm ${
                      isSel
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]/60 ring-2 ring-[var(--accent)]"
                        : "border-[var(--line)] bg-white/90"
                    } ${
                      overItemId === item.id && !isDragging
                        ? "ring-1 ring-[var(--accent)]"
                        : ""
                    } ${
                      item.checked
                        ? "bg-stone-100 text-[var(--muted)] line-through opacity-80"
                        : ""
                    } ${isDragging ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      {isEditing ? (
                        <textarea
                          autoFocus
                          rows={2}
                          value={editText}
                          onChange={(e) => {
                            setEditText(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onFocus={(e) => {
                            e.target.style.height = "auto";
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              const t = editText.trim();
                              if (t && t !== item.text) void renameItem(item.id, t);
                              setEditId(null);
                            } else if (e.key === "Escape") {
                              setEditId(null);
                            }
                          }}
                          onBlur={() => {
                            const t = editText.trim();
                            if (t && t !== item.text) void renameItem(item.id, t);
                            setEditId(null);
                          }}
                          className="w-full resize-none overflow-hidden rounded border border-[var(--accent)] bg-white px-1.5 py-0.5 text-xs sm:text-sm"
                        />
                      ) : (
                        <span className="leading-snug">
                          {item.checked ? "✅ " : ""}
                          {item.text}
                        </span>
                      )}
                      {isSel && selected.size > 1 && !isEditing && (
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
      {menu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-[var(--line)] bg-white py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--accent-soft)]"
            onClick={() => {
              const card = items.find((x) => x.id === menu.id);
              setEditId(menu.id);
              setEditText(card?.text || "");
              setMenu(null);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={() => {
              void deleteItem(menu.id);
              setMenu(null);
              setSelected((prev) => {
                const next = new Set(prev);
                next.delete(menu.id);
                return next;
              });
            }}
          >
            Delete
          </button>
        </div>
      )}
      {undoPending && (
        <UndoToast
          label={undoPending.label}
          onUndo={runUndo}
          onDismiss={dismissUndo}
        />
      )}
    </div>
  );
}
