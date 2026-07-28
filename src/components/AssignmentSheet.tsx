"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  fillDateSeries,
  fillTitleSeries,
  fromInputDate,
  toInputDate,
} from "@/lib/fill";
import type {
  Assignment,
  AssignmentDifficulty,
  AssignmentStatus,
  Course,
} from "@/lib/types";
import {
  ASSIGNMENT_DIFFICULTIES,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_LABELS,
  isSubmittedStyle,
} from "@/lib/types";

export type ColKey =
  | "title"
  | "link"
  | "courseId"
  | "status"
  | "dueAt"
  | "assignmentType"
  | "difficulty"
  | "pointsEarned"
  | "pointsPossible"
  | "notes";

const COL_META: { key: ColKey; label: string; width: string }[] = [
  { key: "title", label: "Title", width: "min-w-[200px]" },
  { key: "link", label: "Link", width: "min-w-[160px]" },
  { key: "courseId", label: "Class", width: "min-w-[120px]" },
  { key: "status", label: "Progress", width: "min-w-[130px]" },
  { key: "dueAt", label: "Due", width: "min-w-[130px]" },
  { key: "assignmentType", label: "Type", width: "min-w-[110px]" },
  { key: "difficulty", label: "Difficulty", width: "min-w-[100px]" },
  { key: "pointsEarned", label: "Earned", width: "min-w-[72px]" },
  { key: "pointsPossible", label: "Possible", width: "min-w-[72px]" },
  { key: "notes", label: "Notes", width: "min-w-[140px]" },
];

const STATUS_LABEL = ASSIGNMENT_STATUS_LABELS;
const STORAGE_KEY = "pa_assignment_columns";

type FillMode = "auto" | "daily" | "weekly";
type CellPos = { row: number; col: number };

function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m?.[0] || null;
}

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function inRange(pos: CellPos, a: CellPos, b: CellPos) {
  const r0 = Math.min(a.row, b.row);
  const r1 = Math.max(a.row, b.row);
  const c0 = Math.min(a.col, b.col);
  const c1 = Math.max(a.col, b.col);
  return pos.row >= r0 && pos.row <= r1 && pos.col >= c0 && pos.col <= c1;
}

export function AssignmentSheet({
  assignments,
  courses,
  onChangeLocal,
  onPatch,
  onAddRow,
  onDelete,
  onBulk,
  onMsg,
}: {
  assignments: Assignment[];
  courses: Course[];
  onChangeLocal: (id: string, patch: Partial<Assignment>) => void;
  onPatch: (patch: Partial<Assignment> & { id: string }) => Promise<void>;
  onAddRow: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBulk: (
    rows: (Partial<Assignment> & { title?: string; id?: string })[],
  ) => Promise<void>;
  onMsg: (msg: string) => void;
}) {
  const [cols, setCols] = useState<ColKey[]>(() => COL_META.map((c) => c.key));
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [active, setActive] = useState<CellPos | null>(null);
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState(false);
  const [fillMode, setFillMode] = useState<FillMode>("weekly");
  const [fillDragging, setFillDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(
    new Map(),
  );

  const rows = useMemo(
    () => [...assignments].sort((a, b) => a.sortOrder - b.sortOrder),
    [assignments],
  );

  const courseLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of courses) m.set(c.id, c.code || c.name);
    return m;
  }, [courses]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ColKey[];
      const known = new Set(COL_META.map((c) => c.key));
      const next = parsed.filter((k) => known.has(k));
      for (const k of COL_META.map((c) => c.key)) {
        if (!next.includes(k)) next.push(k);
      }
      setCols(next);
    } catch {
      /* ignore */
    }
  }, []);

  function persistCols(next: ColKey[]) {
    setCols(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const metaByKey = useMemo(
    () => new Map(COL_META.map((c) => [c.key, c])),
    [],
  );

  function getRaw(a: Assignment, col: ColKey): string {
    switch (col) {
      case "title":
        return a.title;
      case "link":
        return a.link;
      case "courseId":
        return a.courseId || "";
      case "status":
        return a.status;
      case "dueAt":
        return toInputDate(a.dueAt);
      case "assignmentType":
        return a.assignmentType;
      case "difficulty":
        return a.difficulty;
      case "pointsEarned":
        return a.pointsEarned == null ? "" : String(a.pointsEarned);
      case "pointsPossible":
        return a.pointsPossible == null ? "" : String(a.pointsPossible);
      case "notes":
        return a.notes;
    }
  }

  function getDisplay(a: Assignment, col: ColKey): string {
    if (col === "courseId") {
      return a.courseId ? courseLabel.get(a.courseId) || "" : "";
    }
    if (col === "status") return STATUS_LABEL[a.status] || a.status;
    return getRaw(a, col);
  }

  function parseValue(col: ColKey, raw: string): Partial<Assignment> {
    const v = raw.trim();
    switch (col) {
      case "title":
        return { title: v || "Untitled" };
      case "link":
        return { link: v };
      case "courseId": {
        if (!v) return { courseId: null };
        const byId = courses.find((c) => c.id === v);
        if (byId) return { courseId: byId.id };
        const byName = courses.find(
          (c) =>
            (c.code || c.name).toLowerCase() === v.toLowerCase() ||
            c.name.toLowerCase() === v.toLowerCase(),
        );
        return { courseId: byName?.id || null };
      }
      case "status": {
        const match = ASSIGNMENT_STATUSES.find(
          (s) =>
            s === v ||
            STATUS_LABEL[s].toLowerCase() === v.toLowerCase(),
        );
        return match ? { status: match } : {};
      }
      case "dueAt":
        return { dueAt: fromInputDate(v) };
      case "assignmentType":
        return { assignmentType: v };
      case "difficulty": {
        const d = ASSIGNMENT_DIFFICULTIES.find((x) => x === v.toLowerCase());
        return d ? { difficulty: d } : {};
      }
      case "pointsEarned":
        return { pointsEarned: v === "" ? null : Number(v) };
      case "pointsPossible":
        return { pointsPossible: v === "" ? null : Number(v) };
      case "notes":
        return { notes: raw };
    }
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
    setEditing(Boolean(opts?.edit));
  }

  function focusActiveInput() {
    if (!active) return;
    const el = inputRefs.current.get(cellKey(active.row, active.col));
    el?.focus();
    if (el && "select" in el && typeof el.select === "function") {
      try {
        el.select();
      } catch {
        /* select on date inputs can throw */
      }
    }
  }

  useEffect(() => {
    if (editing && active) {
      requestAnimationFrame(() => focusActiveInput());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, active?.row, active?.col]);

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

  async function applyFillRange(
    start: CellPos,
    endRow: number,
    colIndex: number,
  ) {
    const col = cols[colIndex]!;
    const seed = rows[start.row];
    if (!seed) return;
    const count = Math.abs(endRow - start.row) + 1;
    const top = Math.min(start.row, endRow);
    const patchRows: (Partial<Assignment> & { title?: string; id?: string })[] =
      [];

    if (col === "title") {
      const titles = fillTitleSeries(seed.title, count);
      for (let i = 0; i < count; i++) {
        const row = rows[top + i];
        if (row) patchRows.push({ id: row.id, title: titles[i]! });
      }
    } else if (col === "dueAt") {
      const next = rows[start.row + 1];
      const dates = fillDateSeries(
        [toInputDate(seed.dueAt), toInputDate(next?.dueAt || null)],
        count,
        fillMode,
      );
      for (let i = 0; i < count; i++) {
        const row = rows[top + i];
        if (row) {
          patchRows.push({
            id: row.id,
            dueAt: fromInputDate(dates[i] || ""),
          });
        }
      }
    } else {
      const value = seed[col];
      for (let i = 0; i < count; i++) {
        const row = rows[top + i];
        if (row) {
          patchRows.push({
            id: row.id,
            ...({ [col]: value } as Partial<Assignment>),
          });
        }
      }
    }
    if (patchRows.length) {
      await onBulk(patchRows);
      onMsg(`Filled ${patchRows.length} cells`);
    }
  }

  async function fillDownFromActive(count = 4) {
    if (!active) {
      onMsg("Select a cell first");
      return;
    }
    const endRow = Math.min(rows.length - 1, active.row + count - 1);
    // Also create new rows if needed via existing bulk path for title/due
    const seed = rows[active.row];
    if (!seed) return;
    const col = cols[active.col]!;
    const need = count - (rows.length - active.row);
    const titles = fillTitleSeries(seed.title, count);
    const patchRows: (Partial<Assignment> & { title?: string; id?: string })[] =
      [];

    if (col === "title") {
      for (let i = 0; i < count; i++) {
        const existing = rows[active.row + i];
        if (existing) patchRows.push({ id: existing.id, title: titles[i]! });
        else {
          patchRows.push({
            title: titles[i]!,
            courseId: seed.courseId,
            status: seed.status,
            link: seed.link,
            assignmentType: seed.assignmentType,
            difficulty: seed.difficulty,
            pointsEarned: seed.pointsEarned,
            pointsPossible: seed.pointsPossible,
            notes: seed.notes,
            dueAt: seed.dueAt,
            sortOrder: (seed.sortOrder || active.row + 1) + i,
          });
        }
      }
    } else if (col === "dueAt") {
      const dates = fillDateSeries(
        [
          toInputDate(seed.dueAt),
          toInputDate(rows[active.row + 1]?.dueAt || null),
        ],
        count,
        fillMode,
      );
      for (let i = 0; i < count; i++) {
        const existing = rows[active.row + i];
        const dueAt = fromInputDate(dates[i] || "");
        if (existing) patchRows.push({ id: existing.id, dueAt });
        else {
          patchRows.push({
            title: titles[i] || `${seed.title} ${i + 1}`,
            courseId: seed.courseId,
            status: "not_started",
            dueAt,
            link: "",
            assignmentType: seed.assignmentType,
            difficulty: seed.difficulty,
            sortOrder: (seed.sortOrder || active.row + 1) + i,
          });
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        const existing = rows[active.row + i];
        const patch = { [col]: seed[col] } as Partial<Assignment>;
        if (existing) patchRows.push({ id: existing.id, ...patch });
        else {
          patchRows.push({
            title: titles[i] || `${seed.title} ${i + 1}`,
            courseId: seed.courseId,
            status: seed.status,
            dueAt: seed.dueAt,
            link: seed.link,
            assignmentType: seed.assignmentType,
            difficulty: seed.difficulty,
            pointsEarned: seed.pointsEarned,
            pointsPossible: seed.pointsPossible,
            notes: seed.notes,
            sortOrder: (seed.sortOrder || active.row + 1) + i,
            ...patch,
          });
        }
      }
    }
    void need;
    await onBulk(patchRows);
    onMsg(`Filled ${count} ${metaByKey.get(col)?.label || col} cells`);
  }

  async function fillCtrlD() {
    if (!active || active.row === 0) return;
    const above = rows[active.row - 1];
    const cur = rows[active.row];
    const col = cols[active.col]!;
    if (!above || !cur) return;
    const patch = { [col]: above[col] } as Partial<Assignment>;
    await onPatch({ id: cur.id, ...patch });
  }

  function copySelection() {
    if (!active || !selection) return;
    const lines: string[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) {
      const cells: string[] = [];
      for (let c = selection.c0; c <= selection.c1; c++) {
        const row = rows[r];
        const col = cols[c];
        if (row && col) cells.push(getDisplay(row, col));
      }
      lines.push(cells.join("\t"));
    }
    void navigator.clipboard.writeText(lines.join("\n"));
    onMsg("Copied");
  }

  async function pasteClipboard() {
    if (!active) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      onMsg("Clipboard blocked — allow paste permission");
      return;
    }
    if (!text) return;
    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
      .map((line) => line.split("\t"));
    const patchRows: (Partial<Assignment> & { id: string })[] = [];
    for (let ri = 0; ri < matrix.length; ri++) {
      const row = rows[active.row + ri];
      if (!row) break;
      const patch: Partial<Assignment> & { id: string } = { id: row.id };
      for (let ci = 0; ci < matrix[ri]!.length; ci++) {
        const col = cols[active.col + ci];
        if (!col) break;
        Object.assign(patch, parseValue(col, matrix[ri]![ci]!));
      }
      patchRows.push(patch);
      onChangeLocal(row.id, patch);
    }
    if (patchRows.length) {
      await onBulk(patchRows);
      onMsg(`Pasted ${patchRows.length} row(s)`);
    }
  }

  async function clearSelection() {
    if (!selection) return;
    const patchRows: (Partial<Assignment> & { id: string })[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) {
      const row = rows[r];
      if (!row) continue;
      const patch: Partial<Assignment> & { id: string } = { id: row.id };
      for (let c = selection.c0; c <= selection.c1; c++) {
        const col = cols[c];
        if (!col) continue;
        Object.assign(patch, parseValue(col, ""));
      }
      patchRows.push(patch);
    }
    if (patchRows.length) await onBulk(patchRows);
  }

  function moveActive(dr: number, dc: number, shift: boolean) {
    if (!active) {
      if (rows.length) selectCell({ row: 0, col: 0 });
      return;
    }
    const next = {
      row: Math.max(0, Math.min(rows.length - 1, active.row + dr)),
      col: Math.max(0, Math.min(cols.length - 1, active.col + dc)),
    };
    selectCell(next, { shift });
  }

  const onSheetKeyDown = useCallback(
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
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void fillCtrlD();
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
          setEditing(false);
          moveActive(e.shiftKey ? -1 : 1, 0, false);
          sheetRef.current?.focus();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          setEditing(false);
          moveActive(0, e.shiftKey ? -1 : 1, false);
          sheetRef.current?.focus();
          return;
        }
        return;
      }

      if (!active) return;

      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
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
        void clearSelection();
        return;
      }
      // Type to overwrite — start editing
      if (e.key.length === 1 && !meta && !e.altKey) {
        setEditing(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, editing, selection, rows, cols],
  );

  useEffect(() => {
    if (!fillDragging) return;
    function up() {
      setFillDragging(false);
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [fillDragging]);

  function onHeaderDrop(target: ColKey) {
    if (!dragCol || dragCol === target) return;
    const next = [...cols];
    const from = next.indexOf(dragCol);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragCol);
    persistCols(next);
    setDragCol(null);
  }

  function commitBlur(id: string, col: ColKey, value: string) {
    const patch = parseValue(col, value);
    window.setTimeout(() => {
      void onPatch({ id, ...patch });
    }, 40);
  }

  function renderEditor(a: Assignment, col: ColKey, pos: CellPos): ReactNode {
    const key = cellKey(pos.row, pos.col);
    const isEdit = editing && active?.row === pos.row && active?.col === pos.col;
    const setRef = (el: HTMLInputElement | HTMLSelectElement | null) => {
      if (el) inputRefs.current.set(key, el);
      else inputRefs.current.delete(key);
    };

    const common =
      "w-full bg-transparent px-0.5 py-0.5 text-sm outline-none";

    // Display mode — looks like a sheet cell
    if (!isEdit) {
      if (col === "title") {
        const href = a.link.trim() || extractUrl(a.title);
        return (
          <div className="flex min-h-[1.75rem] min-w-0 items-center gap-1 px-0.5">
            <span className="min-w-0 flex-1 truncate">{a.title || " "}</span>
            {href && (
              <a
                href={normalizeUrl(href)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[var(--accent)] no-underline"
                style={{ textDecoration: "none" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => e.stopPropagation()}
                title="Open link"
              >
                ↗
              </a>
            )}
          </div>
        );
      }
      return (
        <div className="flex min-h-[1.75rem] items-center truncate px-0.5">
          {getDisplay(a, col) || "\u00A0"}
        </div>
      );
    }

    if (col === "courseId") {
      return (
        <select
          ref={setRef}
          className={common}
          value={a.courseId || ""}
          onChange={(e) => {
            void onPatch({ id: a.id, courseId: e.target.value || null });
            setEditing(false);
          }}
        >
          <option value="">—</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code || c.name}
            </option>
          ))}
        </select>
      );
    }
    if (col === "status") {
      return (
        <select
          ref={setRef}
          className={common}
          value={a.status}
          onChange={(e) => {
            void onPatch({
              id: a.id,
              status: e.target.value as AssignmentStatus,
            });
            setEditing(false);
          }}
        >
          {ASSIGNMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      );
    }
    if (col === "difficulty") {
      return (
        <select
          ref={setRef}
          className={common}
          value={a.difficulty}
          onChange={(e) => {
            void onPatch({
              id: a.id,
              difficulty: e.target.value as AssignmentDifficulty,
            });
            setEditing(false);
          }}
        >
          {ASSIGNMENT_DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      );
    }
    if (col === "dueAt") {
      return (
        <input
          ref={setRef as (el: HTMLInputElement | null) => void}
          type="date"
          className={common}
          value={toInputDate(a.dueAt)}
          onChange={(e) =>
            void onPatch({ id: a.id, dueAt: fromInputDate(e.target.value) })
          }
        />
      );
    }
    if (col === "pointsEarned" || col === "pointsPossible") {
      return (
        <input
          ref={setRef as (el: HTMLInputElement | null) => void}
          type="number"
          className={common}
          value={
            col === "pointsEarned"
              ? (a.pointsEarned ?? "")
              : (a.pointsPossible ?? "")
          }
          onChange={(e) => {
            const n = e.target.value ? Number(e.target.value) : null;
            if (col === "pointsEarned") onChangeLocal(a.id, { pointsEarned: n });
            else onChangeLocal(a.id, { pointsPossible: n });
          }}
          onBlur={(e) => commitBlur(a.id, col, e.target.value)}
        />
      );
    }

    const value =
      col === "title"
        ? a.title
        : col === "link"
          ? a.link
          : col === "assignmentType"
            ? a.assignmentType
            : a.notes;

    return (
      <input
        ref={setRef as (el: HTMLInputElement | null) => void}
        className={common}
        value={value}
        onChange={(e) => {
          if (col === "title") onChangeLocal(a.id, { title: e.target.value });
          else if (col === "link") onChangeLocal(a.id, { link: e.target.value });
          else if (col === "assignmentType")
            onChangeLocal(a.id, { assignmentType: e.target.value });
          else onChangeLocal(a.id, { notes: e.target.value });
        }}
        onBlur={(e) => commitBlur(a.id, col, e.target.value)}
      />
    );
  }

  const activeLabel = active
    ? `${cols[active.col]?.toUpperCase() || ""}${active.row + 1}`
    : "";
  const activeValue =
    active && rows[active.row] && cols[active.col]
      ? getDisplay(rows[active.row]!, cols[active.col]!)
      : "";

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <button
          type="button"
          onClick={() => void onAddRow()}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
        >
          + Row
        </button>
        <label className="text-xs text-[var(--muted)]">
          Fill
          <select
            className="ml-1 rounded-md border border-[var(--line)] bg-white px-2 py-1"
            value={fillMode}
            onChange={(e) => setFillMode(e.target.value as FillMode)}
          >
            <option value="weekly">weekly</option>
            <option value="daily">daily</option>
            <option value="auto">auto</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void fillDownFromActive(5)}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
        >
          Fill down
        </button>
        <span className="hidden text-xs text-[var(--muted)] lg:inline">
          Arrows move · Enter/F2 edit · ⌘/Ctrl+C/V · ⌘/Ctrl+D fill from above ·
          drag corner handle
        </span>
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-white/50 px-3 py-1.5 text-sm">
        <span className="w-16 shrink-0 rounded border border-[var(--line)] bg-[var(--card)] px-2 py-0.5 text-center font-mono text-xs text-[var(--muted)]">
          {activeLabel || "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[var(--ink)]">
          {activeValue || (
            <span className="text-[var(--muted)]">Select a cell</span>
          )}
        </span>
      </div>

      <div
        ref={sheetRef}
        tabIndex={0}
        onKeyDown={onSheetKeyDown}
        className="max-h-[min(75vh,900px)] overflow-auto outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
      >
        <table className="min-w-[1200px] w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-[var(--card)]">
            <tr>
              <th className="sticky left-0 z-30 w-10 border-b border-r border-[var(--line)] bg-[var(--card)] px-1 py-1.5 text-center text-[10px] font-medium text-[var(--muted)]">
                #
              </th>
              {cols.map((key) => {
                const meta = metaByKey.get(key)!;
                return (
                  <th
                    key={key}
                    draggable
                    onDragStart={() => setDragCol(key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onHeaderDrop(key)}
                    className={`cursor-grab border-b border-r border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] active:cursor-grabbing ${meta.width}`}
                    title="Drag to reorder columns"
                  >
                    {meta.label}
                  </th>
                );
              })}
              <th className="border-b border-[var(--line)] bg-[var(--card)] px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a, rowIdx) => (
              <tr
                key={a.id}
                className={`${
                  rowIdx % 2 === 0 ? "bg-white/40" : "bg-transparent"
                } ${
                  isSubmittedStyle(a.status)
                    ? "bg-stone-100/80 text-[var(--muted)] line-through opacity-70"
                    : ""
                }`}
              >
                <td className="sticky left-0 z-10 border-b border-r border-[var(--line)] bg-[var(--card)] px-1 py-0 text-center font-mono text-[10px] text-[var(--muted)]">
                  {rowIdx + 1}
                </td>
                {cols.map((col, colIdx) => {
                  const pos = { row: rowIdx, col: colIdx };
                  const isActive =
                    active?.row === rowIdx && active?.col === colIdx;
                  const isSel =
                    selection &&
                    inRange(pos, { row: selection.r0, col: selection.c0 }, {
                      row: selection.r1,
                      col: selection.c1,
                    });
                  const showHandle =
                    isActive &&
                    !editing &&
                    selection &&
                    selection.r0 === selection.r1 &&
                    selection.c0 === selection.c1;

                  return (
                    <td
                      key={col}
                      className={`relative border-b border-r border-[var(--line)] px-1 py-0 ${
                        isActive
                          ? "outline outline-2 outline-[var(--accent)] outline-offset-[-1px] z-[1]"
                          : isSel
                            ? "bg-[var(--accent-soft)]/70"
                            : ""
                      }`}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        sheetRef.current?.focus();
                        selectCell(pos, {
                          shift: e.shiftKey,
                          edit: false,
                        });
                      }}
                      onDoubleClick={() => {
                        selectCell(pos, { edit: true });
                      }}
                      onMouseEnter={() => {
                        if (fillDragging && active) {
                          setAnchor(active);
                          setActive({ row: rowIdx, col: active.col });
                        }
                      }}
                      onMouseUp={() => {
                        if (fillDragging && active) {
                          setFillDragging(false);
                          void applyFillRange(active, rowIdx, active.col);
                          setAnchor(active);
                          setActive({ row: rowIdx, col: active.col });
                        }
                      }}
                    >
                      {renderEditor(a, col, pos)}
                      {showHandle && (
                        <span
                          className="absolute bottom-0 right-0 z-[2] h-2.5 w-2.5 translate-x-1/2 translate-y-1/2 cursor-crosshair rounded-[1px] border border-white bg-[var(--accent)]"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFillDragging(true);
                          }}
                          title="Drag to fill"
                        />
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-[var(--line)] px-2 py-0.5">
                  <button
                    type="button"
                    className="text-[10px] text-red-700"
                    onClick={() => void onDelete(a.id)}
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-4 text-sm text-[var(--muted)]">
            No assignments yet — add a row to start.
          </p>
        )}
      </div>
    </section>
  );
}
