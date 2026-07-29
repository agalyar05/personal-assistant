"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  cellAddr,
  colLetter,
  displayValue,
  shiftFormula,
  type ThinkingSheetData,
} from "@/lib/sheet-formulas";

type CellPos = { row: number; col: number };

function inRange(pos: CellPos, a: CellPos, b: CellPos) {
  return (
    pos.row >= Math.min(a.row, b.row) &&
    pos.row <= Math.max(a.row, b.row) &&
    pos.col >= Math.min(a.col, b.col) &&
    pos.col <= Math.max(a.col, b.col)
  );
}

function keyOf(pos: CellPos) {
  return cellAddr(pos.row, pos.col);
}

export function ThinkingSheet({
  data,
  onChange,
}: {
  data: ThinkingSheetData;
  onChange: (next: ThinkingSheetData) => void;
}) {
  const [active, setActive] = useState<CellPos | null>({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState<CellPos | null>({ row: 0, col: 0 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [rangeDragging, setRangeDragging] = useState(false);
  const [fillDragging, setFillDragging] = useState(false);
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  const fillStartRef = useRef<CellPos | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { colCount, rowCount, cells } = data;

  const selection = useMemo(() => {
    if (!active) return null;
    const end = anchor ?? active;
    return {
      r0: Math.min(active.row, end.row),
      r1: Math.max(active.row, end.row),
      c0: Math.min(active.col, end.col),
      c1: Math.max(active.col, end.col),
    };
  }, [active, anchor]);

  function setCell(addr: string, value: string) {
    const next = { ...cells };
    const k = addr.toUpperCase();
    if (!value) delete next[k];
    else next[k] = value;
    onChange({ ...data, cells: next });
  }

  function setCells(patch: Record<string, string | null>) {
    const next = { ...cells };
    for (const [k, v] of Object.entries(patch)) {
      const key = k.toUpperCase();
      if (v == null || v === "") delete next[key];
      else next[key] = v;
    }
    onChange({ ...data, cells: next });
  }

  function selectCell(pos: CellPos, opts?: { shift?: boolean; edit?: boolean }) {
    if (opts?.shift && active) {
      setAnchor(anchor ?? active);
      setActive(pos);
      setEditing(false);
      return;
    }
    setActive(pos);
    setAnchor(pos);
    if (opts?.edit) {
      setDraft(cells[keyOf(pos)] || "");
      setEditing(true);
    } else {
      setEditing(false);
    }
  }

  function commitDraft() {
    if (!active || !editing) return;
    setCell(keyOf(active), draft);
    setEditing(false);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing, active?.row, active?.col]);

  useEffect(() => {
    if (!fillDragging && !rangeDragging) return;
    function up() {
      setFillDragging(false);
      setRangeDragging(false);
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [fillDragging, rangeDragging]);

  function moveActive(dr: number, dc: number, shift: boolean) {
    if (!active) {
      selectCell({ row: 0, col: 0 });
      return;
    }
    selectCell(
      {
        row: Math.max(0, Math.min(rowCount - 1, active.row + dr)),
        col: Math.max(0, Math.min(colCount - 1, active.col + dc)),
      },
      { shift },
    );
  }

  function copySelection() {
    if (!selection) return;
    const lines: string[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) {
      const row: string[] = [];
      for (let c = selection.c0; c <= selection.c1; c++) {
        row.push(cells[cellAddr(r, c)] || "");
      }
      lines.push(row.join("\t"));
    }
    void navigator.clipboard.writeText(lines.join("\n"));
  }

  async function pasteClipboard() {
    if (!active) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text) return;
    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
      .map((line) => line.split("\t"));
    const patch: Record<string, string | null> = {};
    let maxR = active.row;
    let maxC = active.col;
    for (let ri = 0; ri < matrix.length; ri++) {
      for (let ci = 0; ci < matrix[ri]!.length; ci++) {
        const r = active.row + ri;
        const c = active.col + ci;
        if (r >= rowCount || c >= colCount) continue;
        patch[cellAddr(r, c)] = matrix[ri]![ci]!;
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      }
    }
    setCells(patch);
    setAnchor(active);
    setActive({ row: maxR, col: maxC });
  }

  function clearSelection() {
    if (!selection) return;
    const patch: Record<string, string | null> = {};
    for (let r = selection.r0; r <= selection.r1; r++) {
      for (let c = selection.c0; c <= selection.c1; c++) {
        patch[cellAddr(r, c)] = null;
      }
    }
    setCells(patch);
  }

  function applyFill(start: CellPos, endRow: number) {
    const seed = cells[keyOf(start)] || "";
    const top = Math.min(start.row, endRow);
    const bottom = Math.max(start.row, endRow);
    const patch: Record<string, string | null> = {};
    for (let r = top; r <= bottom; r++) {
      if (r === start.row) continue;
      const dRow = r - start.row;
      patch[cellAddr(r, start.col)] = seed.startsWith("=")
        ? shiftFormula(seed, dRow, 0)
        : seed;
    }
    setCells(patch);
  }

  function reorderRows(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next: Record<string, string> = {};
    const order = Array.from({ length: rowCount }, (_, i) => i);
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved!);
    for (let newR = 0; newR < rowCount; newR++) {
      const oldR = order[newR]!;
      for (let c = 0; c < colCount; c++) {
        const v = cells[cellAddr(oldR, c)];
        if (v) next[cellAddr(newR, c)] = v;
      }
    }
    // Note: formulas with absolute row refs aren't rewritten — acceptable for scratchpad
    onChange({ ...data, cells: next });
  }

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
        return;
      }
      if (meta && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void pasteClipboard();
        return;
      }

      if (editing) {
        if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false);
          sheetRef.current?.focus();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commitDraft();
          moveActive(e.shiftKey ? -1 : 1, 0, false);
          sheetRef.current?.focus();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          commitDraft();
          moveActive(0, e.shiftKey ? -1 : 1, false);
          sheetRef.current?.focus();
          return;
        }
        return;
      }

      if (!active) return;
      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        setDraft(cells[keyOf(active)] || "");
        setEditing(true);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        moveActive(0, e.shiftKey ? -1 : 1, false);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(-1, 0, e.shiftKey);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(1, 0, e.shiftKey);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveActive(0, -1, e.shiftKey);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveActive(0, 1, e.shiftKey);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (e.key.length === 1 && !meta && !e.altKey) {
        setDraft(e.key);
        setEditing(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, editing, selection, cells, draft, rowCount, colCount],
  );

  const activeRaw = active ? cells[keyOf(active)] || "" : "";
  const selSum = useMemo(() => {
    if (!selection) return null;
    let sum = 0;
    let count = 0;
    for (let r = selection.r0; r <= selection.r1; r++) {
      for (let c = selection.c0; c <= selection.c1; c++) {
        const v = displayValue(cellAddr(r, c), cells);
        const n = Number(String(v).replace(/,/g, ""));
        if (v !== "" && Number.isFinite(n)) {
          sum += n;
          count++;
        }
      }
    }
    if (!count) return null;
    return { sum, avg: sum / count, count };
  }, [selection, cells]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
          onClick={() =>
            onChange({ ...data, rowCount: Math.min(200, rowCount + 10) })
          }
        >
          + Rows
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
          onClick={() =>
            onChange({ ...data, colCount: Math.min(52, colCount + 2) })
          }
        >
          + Cols
        </button>
        <span className="hidden text-xs text-[var(--muted)] md:inline">
          Type <code className="text-[var(--ink)]">=SUM(A1:A5)</code>,{" "}
          <code className="text-[var(--ink)]">=AVG(B1:B3)</code>,{" "}
          <code className="text-[var(--ink)]">=A1*2+B1</code>
        </span>
        {selSum && (
          <span className="ml-auto text-xs text-[var(--muted)]">
            Sum {selSum.sum} · Avg {Math.round(selSum.avg * 100) / 100} ·{" "}
            {selSum.count} nums
          </span>
        )}
      </div>

      {/* Edit line — shows formula when selected */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-white/40 px-3 py-1.5">
        <span className="w-10 shrink-0 text-center font-mono text-xs text-[var(--muted)]">
          {active ? keyOf(active) : "—"}
        </span>
        {editing && active ? (
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitDraft()}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm text-[var(--ink)]"
            onClick={() => {
              if (!active) return;
              setDraft(activeRaw);
              setEditing(true);
            }}
          >
            {activeRaw || (
              <span className="text-[var(--muted)]">Enter value or =formula</span>
            )}
          </button>
        )}
      </div>

      <div
        ref={sheetRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="max-h-[min(75vh,900px)] overflow-auto outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
      >
        <table className="w-full min-w-[720px] border-collapse text-sm select-none">
          <thead className="sticky top-0 z-20 bg-[var(--card)]">
            <tr>
              <th className="sticky left-0 z-30 w-10 border-b border-r border-[var(--line)] bg-[var(--card)] px-1 py-1 text-[10px] text-[var(--muted)]">
                #
              </th>
              {Array.from({ length: colCount }, (_, c) => (
                <th
                  key={c}
                  className="min-w-[88px] border-b border-r border-[var(--line)] px-2 py-1 text-center text-[10px] font-semibold text-[var(--muted)]"
                >
                  {colLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, r) => (
              <tr
                key={r}
                onDragOver={(e) => {
                  if (dragRowIdx == null) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragRowIdx == null) return;
                  const from = dragRowIdx;
                  setDragRowIdx(null);
                  reorderRows(from, r);
                }}
                className={`${r % 2 === 0 ? "bg-white/40" : ""} ${
                  dragRowIdx === r ? "opacity-50" : ""
                }`}
              >
                <td
                  draggable
                  onDragStart={(e) => {
                    setDragRowIdx(r);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragRowIdx(null)}
                  className="sticky left-0 z-10 cursor-grab border-b border-r border-[var(--line)] bg-[var(--card)] px-1 py-0 text-center font-mono text-[10px] text-[var(--muted)]"
                  title="Drag to reorder"
                >
                  {r + 1}
                </td>
                {Array.from({ length: colCount }, (_, c) => {
                  const pos = { row: r, col: c };
                  const addr = keyOf(pos);
                  const isActive = active?.row === r && active?.col === c;
                  const isSel =
                    selection &&
                    inRange(
                      pos,
                      { row: selection.r0, col: selection.c0 },
                      { row: selection.r1, col: selection.c1 },
                    );
                  const showHandle =
                    isActive &&
                    !editing &&
                    selection &&
                    selection.r0 === selection.r1 &&
                    selection.c0 === selection.c1;
                  const raw = cells[addr] || "";
                  const shown =
                    editing && isActive
                      ? draft
                      : raw.startsWith("=")
                        ? displayValue(addr, cells)
                        : raw;

                  return (
                    <td
                      key={c}
                      className={`relative border-b border-r border-[var(--line)] px-1 py-0 ${
                        isActive
                          ? "z-[1] outline outline-2 outline-[var(--accent)] outline-offset-[-1px]"
                          : isSel
                            ? "bg-[var(--accent-soft)]/70"
                            : ""
                      } ${raw.startsWith("=") && !editing ? "text-[var(--accent)]" : ""}`}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        sheetRef.current?.focus();
                        if (editing && active) commitDraft();
                        if (e.shiftKey && active) {
                          selectCell(pos, { shift: true });
                          return;
                        }
                        selectCell(pos);
                        setRangeDragging(true);
                      }}
                      onDoubleClick={() => {
                        setDraft(cells[addr] || "");
                        selectCell(pos, { edit: true });
                      }}
                      onMouseEnter={() => {
                        if (fillDragging && fillStartRef.current) {
                          const start = fillStartRef.current;
                          setAnchor(start);
                          setActive({ row: r, col: start.col });
                          return;
                        }
                        if (rangeDragging && anchor) setActive(pos);
                      }}
                      onMouseUp={() => {
                        if (fillDragging && fillStartRef.current) {
                          const start = fillStartRef.current;
                          setFillDragging(false);
                          fillStartRef.current = null;
                          applyFill(start, r);
                          setAnchor(start);
                          setActive({ row: r, col: start.col });
                        }
                        setRangeDragging(false);
                      }}
                    >
                      {editing && isActive ? (
                        <input
                          ref={inputRef}
                          className="w-full bg-transparent px-0.5 py-0.5 text-sm outline-none"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commitDraft()}
                        />
                      ) : (
                        <div className="flex min-h-[1.75rem] items-center truncate px-0.5">
                          {shown || "\u00A0"}
                        </div>
                      )}
                      {showHandle && (
                        <span
                          className="absolute bottom-0 right-0 z-[2] h-2.5 w-2.5 translate-x-1/2 translate-y-1/2 cursor-crosshair rounded-[1px] border border-white bg-[var(--accent)]"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setRangeDragging(false);
                            fillStartRef.current = pos;
                            setAnchor(pos);
                            setFillDragging(true);
                          }}
                          title="Fill down"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
