"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  fillDateSeries,
  fillTitleSeries,
  fromInputDate,
  isDueSoon,
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
  isClosedAssignmentStatus,
  isSubmittedStyle,
} from "@/lib/types";
import { faintClassTint } from "@/lib/themes";

export type ColKey =
  | "title"
  | "link"
  | "courseId"
  | "todo"
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
  { key: "todo", label: ".todo", width: "min-w-[64px]" },
  { key: "status", label: "Progress", width: "min-w-[130px]" },
  { key: "dueAt", label: "Due", width: "min-w-[130px]" },
  { key: "assignmentType", label: "Type", width: "min-w-[110px]" },
  { key: "difficulty", label: "Difficulty", width: "min-w-[100px]" },
  { key: "pointsEarned", label: "Earned", width: "min-w-[72px]" },
  { key: "pointsPossible", label: "Possible", width: "min-w-[72px]" },
  { key: "notes", label: "Notes", width: "min-w-[140px]" },
];

const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  title: 200,
  link: 160,
  courseId: 120,
  todo: 64,
  status: 130,
  dueAt: 130,
  assignmentType: 110,
  difficulty: 100,
  pointsEarned: 72,
  pointsPossible: 72,
  notes: 140,
};
const MIN_COL_WIDTH = 48;

const STATUS_LABEL = ASSIGNMENT_STATUS_LABELS;
const STORAGE_KEY = "pa_assignment_columns";
const WIDTH_STORAGE_KEY = "pa_assignment_col_widths";
const SORTABLE_COLS = new Set<ColKey>(["courseId", "dueAt", "status"]);
const TEXT_EDIT_COLS = new Set<ColKey>(["title", "link", "assignmentType", "notes"]);

type FillMode = "auto" | "daily" | "weekly" | "monthly";
type CellPos = { row: number; col: number };
type SortDir = "asc" | "desc";
type SortState = { key: ColKey; dir: SortDir };

/** Shared by the live-sort view and the "sort + persist order" action. Items with
 *  no course/due date always sink to the bottom, regardless of sort direction. */
function compareAssignments(
  a: Assignment,
  b: Assignment,
  key: ColKey,
  mul: 1 | -1,
  courseLabel: Map<string, string>,
): number {
  let cmp = 0;
  if (key === "courseId") {
    const la = a.courseId ? courseLabel.get(a.courseId) || "" : "";
    const lb = b.courseId ? courseLabel.get(b.courseId) || "" : "";
    if (!la && !lb) cmp = 0;
    else if (!la) return 1;
    else if (!lb) return -1;
    else cmp = la.localeCompare(lb, undefined, { sensitivity: "base" });
  } else if (key === "dueAt") {
    const da = a.dueAt || "";
    const db = b.dueAt || "";
    if (!da && !db) cmp = 0;
    else if (!da) return 1;
    else if (!db) return -1;
    else cmp = da.localeCompare(db);
  } else if (key === "status") {
    cmp =
      ASSIGNMENT_STATUSES.indexOf(a.status) - ASSIGNMENT_STATUSES.indexOf(b.status);
  }
  if (cmp === 0) {
    cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  }
  if (cmp === 0) cmp = a.sortOrder - b.sortOrder;
  return cmp * mul;
}

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
  dueSoonBoldDays,
  onChangeLocal,
  onApplySortOrders,
  onPatch,
  onAddRow,
  onInsertRow,
  onDelete,
  onBulk,
  onToggleTodo,
  onMsg,
}: {
  assignments: Assignment[];
  courses: Course[];
  /** Bold a row if its due date is overdue, today, or within this many days. */
  dueSoonBoldDays: number;
  onChangeLocal: (id: string, patch: Partial<Assignment>) => void;
  onApplySortOrders: (orders: { id: string; sortOrder: number }[]) => void;
  onPatch: (patch: Partial<Assignment> & { id: string }) => Promise<void>;
  onAddRow: () => Promise<void>;
  onInsertRow: (
    index: number,
    where: "above" | "below",
  ) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onBulk: (
    rows: (Partial<Assignment> & { title?: string; id?: string })[],
    opts?: { keepLocal?: boolean },
  ) => Promise<void>;
  onToggleTodo: (id: string, onTodo: boolean) => Promise<void>;
  onMsg: (msg: string) => void;
}) {
  const [cols, setCols] = useState<ColKey[]>(() => COL_META.map((c) => c.key));
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_COL_WIDTHS };
    try {
      const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_COL_WIDTHS };
      const parsed = JSON.parse(raw) as Record<string, number>;
      return { ...DEFAULT_COL_WIDTHS, ...parsed };
    } catch {
      return { ...DEFAULT_COL_WIDTHS };
    }
  });
  const resizingRef = useRef<{ col: ColKey; startX: number; startWidth: number } | null>(
    null,
  );
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [active, setActive] = useState<CellPos | null>(null);
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState(false);
  const [fillMode, setFillMode] = useState<FillMode>("weekly");
  const [fillCount, setFillCount] = useState("5");
  const [fillDragging, setFillDragging] = useState(false);
  const [rangeDragging, setRangeDragging] = useState(false);
  // The full set of row indexes being dragged together — a single row, or
  // every row in the active multi-row selection when the drag started on a
  // row that was already part of it.
  const [dragRowSet, setDragRowSet] = useState<number[] | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    rowIdx: number;
    edge: "above" | "below";
  } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    row: number;
  } | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const fillStartRef = useRef<CellPos | null>(null);
  const fillSourceRef = useRef<{
    r0: number;
    r1: number;
    c0: number;
    c1: number;
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(
    new Map(),
  );
  const headerDraggedRef = useRef(false);
  const blurTimersRef = useRef<Set<number>>(new Set());
  // Set right before entering edit mode via direct typing (seeded with the
  // first character) — skips the normal select-all-on-focus so the next
  // keystroke appends instead of replacing what was just typed.
  const skipSelectOnFocusRef = useRef(false);

  useEffect(() => {
    const timers = blurTimersRef.current;
    return () => {
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings?slim=1");
      const json = await res.json();
      const saved = json.settings?.masterlistSheetSort as SortState | null;
      if (saved) setSort(saved);
    })();
  }, []);

  async function setPersistentSort(next: SortState | null) {
    setSort(next);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterlistSheetSort: next }),
    });
  }

  const courseLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of courses) m.set(c.id, c.code || c.name);
    return m;
  }, [courses]);

  const courseColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of courses) m.set(c.id, c.color);
    return m;
  }, [courses]);

  const rows = useMemo(() => {
    const list = [...assignments];
    if (!sort || !SORTABLE_COLS.has(sort.key)) {
      return list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const mul = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => compareAssignments(a, b, sort.key, mul, courseLabel));
  }, [assignments, sort, courseLabel]);

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

  function persistColWidths(next: Record<string, number>) {
    setColWidths(next);
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function startColumnResize(col: ColKey, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      col,
      startX: e.clientX,
      startWidth: colWidths[col] ?? DEFAULT_COL_WIDTHS[col],
    };
    function onMove(ev: MouseEvent) {
      const state = resizingRef.current;
      if (!state) return;
      const next = Math.max(
        MIN_COL_WIDTH,
        state.startWidth + (ev.clientX - state.startX),
      );
      setColWidths((prev) => ({ ...prev, [state.col]: next }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const state = resizingRef.current;
      resizingRef.current = null;
      if (!state) return;
      setColWidths((prev) => {
        persistColWidths(prev);
        return prev;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
      case "todo":
        return a.todoItemId ? "1" : "";
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
    if (col === "todo") return a.todoItemId ? "✓" : "";
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
      case "todo":
        return {};
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
    el?.focus({ preventScroll: true });
    if (skipSelectOnFocusRef.current) {
      skipSelectOnFocusRef.current = false;
      if (el && "setSelectionRange" in el) {
        try {
          const len = (el as HTMLInputElement).value.length;
          (el as HTMLInputElement).setSelectionRange(len, len);
        } catch {
          /* setSelectionRange on some input types can throw */
        }
      }
      return;
    }
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

  /** Spreadsheet-style fill: extend selection downward into new rows. */
  async function applyFillFromSelection(
    source: { r0: number; r1: number; c0: number; c1: number },
    endRow: number,
  ) {
    if (endRow <= source.r1) {
      onMsg("Drag the fill handle below the selection");
      return;
    }
    const srcH = source.r1 - source.r0 + 1;
    const destCount = endRow - source.r1;
    const byId = new Map<
      string,
      Partial<Assignment> & { id: string; title?: string }
    >();

    function merge(
      id: string,
      title: string,
      patch: Partial<Assignment>,
    ) {
      const prev = byId.get(id) || { id, title };
      byId.set(id, { ...prev, ...patch, id, title: patch.title ?? prev.title });
    }

    for (let c = source.c0; c <= source.c1; c++) {
      const col = cols[c];
      if (!col || col === "todo") continue;
      const srcRows: Assignment[] = [];
      for (let r = source.r0; r <= source.r1; r++) {
        const row = rows[r];
        if (row) srcRows.push(row);
      }
      if (!srcRows.length) continue;

      if (col === "title") {
        const titles = fillTitleSeries(
          srcRows[0]!.title,
          srcH + destCount,
        );
        for (let i = 0; i < destCount; i++) {
          const row = rows[source.r1 + 1 + i];
          if (row) merge(row.id, row.title, { title: titles[srcH + i]! });
        }
      } else if (col === "dueAt") {
        const seeds = srcRows.map((r) => toInputDate(r.dueAt));
        const dates = fillDateSeries(seeds, srcH + destCount, fillMode);
        for (let i = 0; i < destCount; i++) {
          const row = rows[source.r1 + 1 + i];
          if (row) {
            merge(row.id, row.title, {
              dueAt: fromInputDate(dates[srcH + i] || ""),
            });
          }
        }
      } else {
        for (let i = 0; i < destCount; i++) {
          const src = srcRows[i % srcRows.length]!;
          const row = rows[source.r1 + 1 + i];
          if (!row) continue;
          if (col === "courseId") {
            merge(row.id, row.title, { courseId: src.courseId });
          } else if (col === "status") {
            merge(row.id, row.title, { status: src.status });
          } else if (col === "assignmentType") {
            merge(row.id, row.title, { assignmentType: src.assignmentType });
          } else if (col === "difficulty") {
            merge(row.id, row.title, { difficulty: src.difficulty });
          } else if (col === "pointsEarned") {
            merge(row.id, row.title, { pointsEarned: src.pointsEarned });
          } else if (col === "pointsPossible") {
            merge(row.id, row.title, { pointsPossible: src.pointsPossible });
          } else if (col === "notes") {
            merge(row.id, row.title, { notes: src.notes });
          } else if (col === "link") {
            merge(row.id, row.title, { link: src.link });
          }
        }
      }
    }

    const patchRows = [...byId.values()];
    if (patchRows.length) {
      await onBulk(patchRows);
      onMsg(`Filled ${destCount} row(s)`);
    }
  }

  async function fillDownFromActive(count = 4) {
    if (!active) {
      onMsg("Select a cell first");
      return;
    }
    // Also create new rows if needed via existing bulk path for title/due
    const seed = rows[active.row];
    if (!seed) return;
    const col = cols[active.col]!;
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
      if (col === "todo") {
        onMsg("Use the .todo checkbox on each row");
        return;
      }
      for (let i = 0; i < count; i++) {
        const existing = rows[active.row + i];
        const patch: Partial<Assignment> = {};
        if (col === "courseId") patch.courseId = seed.courseId;
        else if (col === "status") patch.status = seed.status;
        else if (col === "link") patch.link = seed.link;
        else if (col === "assignmentType")
          patch.assignmentType = seed.assignmentType;
        else if (col === "difficulty") patch.difficulty = seed.difficulty;
        else if (col === "pointsEarned") patch.pointsEarned = seed.pointsEarned;
        else if (col === "pointsPossible")
          patch.pointsPossible = seed.pointsPossible;
        else if (col === "notes") patch.notes = seed.notes;
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
    await onBulk(patchRows);
    onMsg(`Filled ${count} ${metaByKey.get(col)?.label || col} cells`);
  }

  async function fillCtrlD() {
    if (!active || active.row === 0) return;
    const above = rows[active.row - 1];
    const cur = rows[active.row];
    const col = cols[active.col]!;
    if (!above || !cur || col === "todo") return;
    const patch: Partial<Assignment> = {};
    if (col === "title") patch.title = above.title;
    else if (col === "courseId") patch.courseId = above.courseId;
    else if (col === "status") patch.status = above.status;
    else if (col === "link") patch.link = above.link;
    else if (col === "dueAt") patch.dueAt = above.dueAt;
    else if (col === "assignmentType")
      patch.assignmentType = above.assignmentType;
    else if (col === "difficulty") patch.difficulty = above.difficulty;
    else if (col === "pointsEarned") patch.pointsEarned = above.pointsEarned;
    else if (col === "pointsPossible")
      patch.pointsPossible = above.pointsPossible;
    else if (col === "notes") patch.notes = above.notes;
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
          sheetRef.current?.focus({ preventScroll: true });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setEditing(false);
          moveActive(e.shiftKey ? -1 : 1, 0, false);
          sheetRef.current?.focus({ preventScroll: true });
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          setEditing(false);
          moveActive(0, e.shiftKey ? -1 : 1, false);
          sheetRef.current?.focus({ preventScroll: true });
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
      // Type to overwrite — start editing. Explicitly seed the new value
      // (rather than relying on native select-then-type, which races with
      // the deferred focus effect below) and preventDefault so the keystroke
      // doesn't also fall through to the browser's default handling on the
      // still-focused sheet div — that stray default action is what was
      // scrolling the page on some keys instead of typing into the cell.
      if (e.key.length === 1 && !meta && !e.altKey) {
        e.preventDefault();
        const col = cols[active.col];
        const row = rows[active.row];
        if (row && col && TEXT_EDIT_COLS.has(col)) {
          const field =
            col === "title"
              ? "title"
              : col === "link"
                ? "link"
                : col === "assignmentType"
                  ? "assignmentType"
                  : "notes";
          onChangeLocal(row.id, { [field]: e.key });
          skipSelectOnFocusRef.current = true;
        }
        setEditing(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, editing, selection, rows, cols],
  );

  useEffect(() => {
    if (!fillDragging && !rangeDragging) return;
    function up() {
      if (fillDragging && fillSourceRef.current && active) {
        const src = fillSourceRef.current;
        if (active.row > src.r1) {
          void applyFillFromSelection(src, active.row);
        }
      }
      fillSourceRef.current = null;
      fillStartRef.current = null;
      setFillDragging(false);
      setRangeDragging(false);
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillDragging, rangeDragging, active]);

  useEffect(() => {
    if (!ctxMenu) return;
    function close() {
      setCtxMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCtxMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  async function commitRowOrder(next: Assignment[]) {
    const patchRows = next.map((row, i) => ({
      id: row.id,
      title: row.title,
      sortOrder: i + 1,
    }));
    onApplySortOrders(
      patchRows.map((p) => ({ id: p.id, sortOrder: p.sortOrder })),
    );
    setSort(null);
    await onBulk(patchRows, { keepLocal: true });
    onMsg("Rows reordered");
  }

  async function reorderRows(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    if (toIdx >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    await commitRowOrder(next);
  }

  /** Drags every row in `fromIndexes` together, dropping them as a block
   * just above or below the row currently at `toIdx`. */
  async function reorderRowBlock(
    fromIndexes: number[],
    toIdx: number,
    edge: "above" | "below",
  ) {
    const fromSet = new Set(fromIndexes);
    if (fromSet.has(toIdx) || toIdx < 0 || toIdx >= rows.length) return;
    const anchorRow = rows[toIdx];
    const movedRows = fromIndexes
      .slice()
      .sort((a, b) => a - b)
      .map((i) => rows[i])
      .filter((r): r is Assignment => Boolean(r));
    if (!movedRows.length) return;
    const remaining = rows.filter((_, i) => !fromSet.has(i));
    const insertAt =
      remaining.indexOf(anchorRow) + (edge === "below" ? 1 : 0);
    const next = [...remaining];
    next.splice(insertAt, 0, ...movedRows);
    await commitRowOrder(next);
  }

  async function sortByColumn(key: ColKey) {
    if (!SORTABLE_COLS.has(key)) return;
    const nextDir: SortDir =
      sort?.key === key && sort.dir === "asc" ? "desc" : "asc";
    const nextSort: SortState = { key, dir: nextDir };
    setSort(nextSort);

    const mul = nextDir === "asc" ? 1 : -1;
    const sorted = [...assignments].sort((a, b) =>
      compareAssignments(a, b, key, mul, courseLabel),
    );

    const patchRows = sorted.map((row, i) => ({
      id: row.id,
      title: row.title,
      sortOrder: i + 1,
    }));
    onApplySortOrders(
      patchRows.map((p) => ({ id: p.id, sortOrder: p.sortOrder })),
    );
    await onBulk(patchRows, { keepLocal: true });
    const label =
      key === "courseId" ? "class" : key === "dueAt" ? "due date" : "progress";
    onMsg(`Sorted by ${label} (${nextDir === "asc" ? "A→Z" : "Z→A"})`);
  }

  function selectedRowIndexes(): number[] {
    if (!selection) {
      return ctxMenu ? [ctxMenu.row] : active ? [active.row] : [];
    }
    const out: number[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) out.push(r);
    return out;
  }

  async function deleteSelectedRows() {
    const idxs = selectedRowIndexes();
    const ids = idxs.map((i) => rows[i]?.id).filter(Boolean) as string[];
    if (!ids.length) return;
    for (const id of ids) await onDelete(id);
    onMsg(ids.length === 1 ? "Row deleted" : `${ids.length} rows deleted`);
    setActive(null);
    setAnchor(null);
  }

  function openRowMenu(e: ReactMouseEvent, rowIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    if (!selection || rowIdx < selection.r0 || rowIdx > selection.r1) {
      selectCell({ row: rowIdx, col: active?.col ?? 0 });
    }
    setEditing(false);
    setCtxMenu({ x: e.clientX, y: e.clientY, row: rowIdx });
  }

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
    // Short delay so a click that's moving the active cell/selection lands first —
    // committing immediately can race the mousedown handler for the next cell.
    const timer = window.setTimeout(() => {
      blurTimersRef.current.delete(timer);
      void onPatch({ id, ...patch });
    }, 40);
    blurTimersRef.current.add(timer);
  }

  function renderEditor(a: Assignment, col: ColKey, pos: CellPos): ReactNode {
    const key = cellKey(pos.row, pos.col);
    const isEdit = editing && active?.row === pos.row && active?.col === pos.col;
    const setRef = (el: HTMLInputElement | HTMLSelectElement | null) => {
      if (el) inputRefs.current.set(key, el);
      else inputRefs.current.delete(key);
    };

    // Match the display <div>'s min-h-[1.75rem] so entering edit mode doesn't
    // change the row's height and shift everything while you're typing.
    const common =
      "w-full min-h-[1.75rem] bg-transparent px-0.5 py-0.5 text-sm outline-none";

    if (col === "todo") {
      return (
        <div className="flex min-h-[1.75rem] items-center justify-center">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
            checked={Boolean(a.todoItemId)}
            title={
              a.todoItemId
                ? "On .todo — uncheck to remove"
                : "Add to .todo"
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              void onToggleTodo(a.id, e.target.checked);
            }}
          />
        </div>
      );
    }

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
          className={`${common} cursor-pointer`}
          value={a.courseId || ""}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const courseId = e.target.value || null;
            onChangeLocal(a.id, { courseId });
            void onPatch({ id: a.id, courseId });
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
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
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
            <option value="monthly">monthly</option>
            <option value="auto">auto</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Rows
          <input
            type="number"
            min={1}
            max={50}
            className="ml-1 w-14 rounded-md border border-[var(--line)] bg-white px-2 py-1"
            value={fillCount}
            onChange={(e) => setFillCount(e.target.value)}
            onBlur={() => {
              if (fillCount === "") setFillCount("5");
            }}
          />
        </label>
        <button
          type="button"
          onClick={() =>
            void fillDownFromActive(
              Math.max(1, Math.min(50, Number(fillCount) || 5)),
            )
          }
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
        >
          Fill down
        </button>
        <label className="text-xs text-[var(--muted)]">
          Always sort by
          <select
            className="ml-1 rounded-md border border-[var(--line)] bg-white px-2 py-1"
            value={sort?.key || "manual"}
            onChange={(e) => {
              const key = e.target.value;
              void setPersistentSort(
                key === "manual" ? null : { key: key as SortState["key"], dir: "asc" },
              );
            }}
          >
            <option value="manual">Manual (drag)</option>
            <option value="dueAt">Due date</option>
            <option value="courseId">Class</option>
            <option value="status">Progress</option>
          </select>
        </label>
        <span className="hidden text-xs text-[var(--muted)] lg:inline">
          Drag ▢ corner to fill · click Class / Due / Progress to sort once
        </span>
      </div>

      <div
        ref={sheetRef}
        tabIndex={0}
        onKeyDown={onSheetKeyDown}
        onContextMenu={(e) => {
          // allow browser menu only outside table body handling
          if ((e.target as HTMLElement).closest("tbody")) {
            /* handled per-row */
          }
        }}
        className="max-h-[min(75vh,900px)] overflow-auto outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
      >
        <table
          className="border-collapse text-sm select-none"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: 40 }} />
            {cols.map((key) => (
              <col
                key={key}
                style={{ width: colWidths[key] ?? DEFAULT_COL_WIDTHS[key] }}
              />
            ))}
            <col />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-[var(--card)]">
            <tr>
              <th className="sticky left-0 z-30 w-10 border-b border-r border-[var(--line)] bg-[var(--card)] px-1 py-1.5 text-center text-[10px] font-medium text-[var(--muted)]">
                #
              </th>
              {cols.map((key) => {
                const meta = metaByKey.get(key)!;
                const sortable = SORTABLE_COLS.has(key);
                const activeSort = sort?.key === key;
                return (
                  <th
                    key={key}
                    draggable
                    onDragStart={() => {
                      headerDraggedRef.current = false;
                      setDragCol(key);
                    }}
                    onDrag={() => {
                      headerDraggedRef.current = true;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onHeaderDrop(key)}
                    onClick={() => {
                      if (headerDraggedRef.current) return;
                      if (sortable) void sortByColumn(key);
                    }}
                    className={`relative border-b border-r border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] overflow-hidden ${
                      sortable
                        ? "cursor-pointer select-none hover:text-[var(--ink)]"
                        : "cursor-grab active:cursor-grabbing"
                    } ${activeSort ? "text-[var(--accent)]" : ""}`}
                    title={
                      sortable
                        ? "Click to sort · drag to reorder columns"
                        : "Drag to reorder columns"
                    }
                  >
                    <span className="inline-flex items-center gap-1 truncate">
                      {meta.label}
                      {sortable && (
                        <span
                          className={`text-[9px] ${
                            activeSort ? "opacity-100" : "opacity-35"
                          }`}
                          aria-hidden
                        >
                          {activeSort
                            ? sort.dir === "asc"
                              ? "▲"
                              : "▼"
                            : "↕"}
                        </span>
                      )}
                    </span>
                    <span
                      draggable={false}
                      onMouseDown={(e) => startColumnResize(key, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none hover:bg-[var(--accent)]/40"
                      title="Drag to resize column"
                    />
                  </th>
                );
              })}
              <th className="border-b border-[var(--line)] bg-[var(--card)] px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a, rowIdx) => {
              const classHex = a.courseId ? courseColor.get(a.courseId) : null;
              const rowTint = classHex ? faintClassTint(classHex) : undefined;
              return (
              <tr
                key={a.id}
                onContextMenu={(e) => openRowMenu(e, rowIdx)}
                onDragOver={(e) => {
                  if (dragRowSet == null) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const edge: "above" | "below" =
                    e.clientY < rect.top + rect.height / 2 ? "above" : "below";
                  setDropIndicator((prev) =>
                    prev?.rowIdx === rowIdx && prev.edge === edge
                      ? prev
                      : { rowIdx, edge },
                  );
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragRowSet == null) return;
                  const from = dragRowSet;
                  // Compute edge fresh from the drop event's own coordinates
                  // rather than trusting the last dragover's state — a drop
                  // can in principle land before that render flushes.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const edge: "above" | "below" =
                    e.clientY < rect.top + rect.height / 2 ? "above" : "below";
                  setDragRowSet(null);
                  setDropIndicator(null);
                  void reorderRowBlock(from, rowIdx, edge);
                }}
                className={`${
                  !rowTint
                    ? rowIdx % 2 === 0
                      ? "bg-white/40"
                      : "bg-transparent"
                    : ""
                } ${
                  isSubmittedStyle(a.status)
                    ? "text-[var(--muted)] line-through opacity-70"
                    : ""
                } ${
                  !isClosedAssignmentStatus(a.status) &&
                  isDueSoon(a.dueAt, dueSoonBoldDays)
                    ? "font-bold"
                    : ""
                } ${dragRowSet?.includes(rowIdx) ? "opacity-50" : ""}`}
                style={rowTint ? { backgroundColor: rowTint } : undefined}
              >
                <td
                  draggable
                  onMouseDown={(e) => {
                    if (e.shiftKey && active) {
                      setAnchor(anchor ?? { row: active.row, col: 0 });
                      setActive({ row: rowIdx, col: cols.length - 1 });
                    } else {
                      setActive({ row: rowIdx, col: 0 });
                      setAnchor({ row: rowIdx, col: cols.length - 1 });
                    }
                    setEditing(false);
                  }}
                  onDragStart={(e) => {
                    const selRows =
                      selection && selection.r1 > selection.r0
                        ? Array.from(
                            { length: selection.r1 - selection.r0 + 1 },
                            (_, i) => selection.r0 + i,
                          )
                        : [];
                    const set = selRows.includes(rowIdx) ? selRows : [rowIdx];
                    setDragRowSet(set);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(rowIdx));
                  }}
                  onDragEnd={() => {
                    setDragRowSet(null);
                    setDropIndicator(null);
                  }}
                  className={`sticky left-0 z-10 cursor-grab border-b border-r border-r-[var(--line)] px-1 py-0 text-center font-mono text-[10px] text-[var(--muted)] active:cursor-grabbing ${
                    dropIndicator?.rowIdx === rowIdx &&
                    dropIndicator.edge === "above"
                      ? "border-t-2 border-t-[var(--accent)]"
                      : "border-t border-t-transparent"
                  } ${
                    dropIndicator?.rowIdx === rowIdx &&
                    dropIndicator.edge === "below"
                      ? "border-b-2 border-b-[var(--accent)]"
                      : "border-b-[var(--line)]"
                  } ${
                    selection &&
                    selection.r1 > selection.r0 &&
                    rowIdx >= selection.r0 &&
                    rowIdx <= selection.r1
                      ? "!bg-[var(--accent)]/20"
                      : ""
                  }`}
                  style={{ backgroundColor: rowTint || "var(--card)" }}
                  title="Drag to reorder (drag a multi-row selection to move it together) · right-click for menu"
                >
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
                    !editing &&
                    selection &&
                    rowIdx === selection.r1 &&
                    colIdx === selection.c1;

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
                        const tag = (e.target as HTMLElement).tagName;
                        if (
                          tag === "SELECT" ||
                          tag === "OPTION" ||
                          tag === "INPUT" ||
                          tag === "A" ||
                          tag === "BUTTON"
                        ) {
                          return;
                        }
                        e.preventDefault();
                        sheetRef.current?.focus({ preventScroll: true });
                        if (e.shiftKey && active) {
                          selectCell(pos, { shift: true, edit: false });
                          return;
                        }
                        // Class opens dropdown on click; other cells select first.
                        selectCell(pos, { edit: col === "courseId" });
                        if (col !== "courseId") setRangeDragging(true);
                      }}
                      onDoubleClick={() => {
                        if (col === "todo") return;
                        selectCell(pos, { edit: true });
                      }}
                      onMouseEnter={() => {
                        if (fillDragging && fillSourceRef.current) {
                          const src = fillSourceRef.current;
                          setAnchor({ row: src.r0, col: src.c0 });
                          setActive({
                            row: Math.max(src.r1, rowIdx),
                            col: src.c1,
                          });
                          return;
                        }
                        if (rangeDragging && anchor) {
                          setActive(pos);
                        }
                      }}
                      onMouseUp={() => {
                        if (fillDragging && fillSourceRef.current) {
                          const src = fillSourceRef.current;
                          setFillDragging(false);
                          fillSourceRef.current = null;
                          fillStartRef.current = null;
                          void applyFillFromSelection(src, rowIdx);
                          setAnchor({ row: src.r0, col: src.c0 });
                          setActive({
                            row: Math.max(src.r1, rowIdx),
                            col: src.c1,
                          });
                        }
                        setRangeDragging(false);
                      }}
                    >
                      {renderEditor(a, col, pos)}
                      {showHandle && (
                        <span
                          className="absolute bottom-0 right-0 z-[2] h-2.5 w-2.5 translate-x-1/2 translate-y-1/2 cursor-crosshair rounded-[1px] border border-white bg-[var(--accent)]"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!selection) return;
                            setRangeDragging(false);
                            fillSourceRef.current = { ...selection };
                            fillStartRef.current = {
                              row: selection.r1,
                              col: selection.c1,
                            };
                            setFillDragging(true);
                          }}
                          title="Drag down to fill"
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
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-4 text-sm text-[var(--muted)]">
            No items yet — add a row to start.
          </p>
        )}
      </div>

      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[11rem] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 text-sm shadow-lg"
          style={{
            left: Math.min(ctxMenu.x, window.innerWidth - 200),
            top: Math.min(ctxMenu.y, window.innerHeight - 280),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(
            [
              {
                label: "Insert row above",
                run: () => void onInsertRow(ctxMenu.row, "above"),
              },
              {
                label: "Insert row below",
                run: () => void onInsertRow(ctxMenu.row, "below"),
              },
              {
                label: "Add row at bottom",
                run: () => void onAddRow(),
              },
              { type: "sep" as const },
              {
                label: "Move row up",
                disabled: ctxMenu.row <= 0,
                run: () => void reorderRows(ctxMenu.row, ctxMenu.row - 1),
              },
              {
                label: "Move row down",
                disabled: ctxMenu.row >= rows.length - 1,
                run: () => void reorderRows(ctxMenu.row, ctxMenu.row + 1),
              },
              { type: "sep" as const },
              {
                label:
                  selectedRowIndexes().length > 1
                    ? `Delete ${selectedRowIndexes().length} rows`
                    : "Delete row",
                danger: true,
                run: () => void deleteSelectedRows(),
              },
            ] as (
              | { type: "sep" }
              | {
                  label: string;
                  run: () => void;
                  disabled?: boolean;
                  danger?: boolean;
                }
            )[]
          ).map((item, i) =>
            "type" in item && item.type === "sep" ? (
              <div
                key={`sep-${i}`}
                className="my-1 border-t border-[var(--line)]"
              />
            ) : (
              <button
                key={"label" in item ? item.label : i}
                type="button"
                disabled={"disabled" in item && item.disabled}
                className={`flex w-full px-3 py-1.5 text-left disabled:opacity-40 ${
                  "danger" in item && item.danger
                    ? "text-red-700 hover:bg-red-50"
                    : "text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                }`}
                onClick={() => {
                  if ("run" in item) item.run();
                  setCtxMenu(null);
                }}
              >
                {"label" in item ? item.label : null}
              </button>
            ),
          )}
        </div>
      )}
    </section>
  );
}
