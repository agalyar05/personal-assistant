"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fillDateSeries,
  fillTitleSeries,
  fromInputDateTime,
  toInputDateTime,
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
  { key: "title", label: "Title", width: "min-w-[180px]" },
  { key: "link", label: "Link", width: "min-w-[160px]" },
  { key: "courseId", label: "Class", width: "min-w-[120px]" },
  { key: "status", label: "Progress", width: "min-w-[140px]" },
  { key: "dueAt", label: "Due", width: "min-w-[190px]" },
  { key: "assignmentType", label: "Type", width: "min-w-[110px]" },
  { key: "difficulty", label: "Difficulty", width: "min-w-[110px]" },
  { key: "pointsEarned", label: "Earned", width: "min-w-[80px]" },
  { key: "pointsPossible", label: "Possible", width: "min-w-[80px]" },
  { key: "notes", label: "Notes", width: "min-w-[140px]" },
];

const STATUS_LABEL = ASSIGNMENT_STATUS_LABELS;

const STORAGE_KEY = "pa_assignment_columns";

type FillMode = "auto" | "daily" | "weekly";

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
  const [cols, setCols] = useState<ColKey[]>(() =>
    COL_META.map((c) => c.key),
  );
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [selected, setSelected] = useState<{
    rowId: string;
    col: ColKey;
  } | null>(null);
  const [fillMode, setFillMode] = useState<FillMode>("weekly");
  const [fillRows, setFillRows] = useState(4);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

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

  async function runFillDown() {
    if (!selected) {
      onMsg("Click a Title or Due cell first, then Fill down");
      return;
    }
    const sorted = [...assignments].sort((a, b) => a.sortOrder - b.sortOrder);
    const startIdx = sorted.findIndex((a) => a.id === selected.rowId);
    if (startIdx < 0) return;
    const seed = sorted[startIdx]!;
    const count = fillRows;
    const rows: (Partial<Assignment> & { title?: string; id?: string })[] = [];

    if (selected.col === "title") {
      const titles = fillTitleSeries(seed.title, count);
      for (let i = 0; i < count; i++) {
        const existing = sorted[startIdx + i];
        if (existing) rows.push({ id: existing.id, title: titles[i]! });
        else {
          rows.push({
            title: titles[i]!,
            courseId: seed.courseId,
            status: seed.status,
            link: seed.link,
            assignmentType: seed.assignmentType,
            difficulty: seed.difficulty,
            sortOrder: (seed.sortOrder || startIdx + 1) + i,
          });
        }
      }
    } else if (selected.col === "dueAt") {
      const seeds = [
        toInputDateTime(seed.dueAt),
        toInputDateTime(sorted[startIdx + 1]?.dueAt || null),
      ];
      const dates = fillDateSeries(seeds, count, fillMode);
      const titles = fillTitleSeries(seed.title, count);
      for (let i = 0; i < count; i++) {
        const existing = sorted[startIdx + i];
        const dueAt = fromInputDateTime(dates[i] || "");
        if (existing) rows.push({ id: existing.id, dueAt });
        else {
          rows.push({
            title: titles[i] || `${seed.title} ${i + 1}`,
            courseId: seed.courseId,
            status: "not_started",
            dueAt,
            link: "",
            assignmentType: seed.assignmentType,
            difficulty: seed.difficulty,
            sortOrder: (seed.sortOrder || startIdx + 1) + i,
          });
        }
      }
    } else {
      onMsg("Fill down works on Title or Due columns");
      return;
    }

    await onBulk(rows);
    onMsg(
      selected.col === "dueAt"
        ? `Filled ${count} due dates (${fillMode})`
        : `Filled ${count} titles`,
    );
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

  function renderCell(a: Assignment, col: ColKey) {
    const active = selected?.rowId === a.id && selected.col === col;
    const wrap = (child: React.ReactNode) => (
      <td
        key={col}
        className={`border-b border-r border-[var(--line)] px-1.5 py-0.5 ${
          active ? "bg-[var(--accent-soft)] outline outline-1 outline-[var(--accent)]" : ""
        }`}
        onClick={() => setSelected({ rowId: a.id, col })}
      >
        {child}
      </td>
    );

    switch (col) {
      case "title": {
        const href = a.link.trim() || extractUrl(a.title);
        return wrap(
          <div className="flex min-w-0 items-center gap-1">
            <input
              className="min-w-0 flex-1 bg-transparent py-1 outline-none"
              value={a.title}
              onChange={(e) => onChangeLocal(a.id, { title: e.target.value })}
              onFocus={() => {
                setEditingTitleId(a.id);
                setSelected({ rowId: a.id, col: "title" });
              }}
              onBlur={(e) => {
                setEditingTitleId(null);
                const next = e.target.value.trim() || "Untitled";
                // Defer so Class/Due click registers before React re-renders
                window.setTimeout(() => {
                  void onPatch({ id: a.id, title: next });
                }, 50);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            {href && (
              <a
                href={normalizeUrl(href)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[var(--accent)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => e.stopPropagation()}
                title="Open link"
              >
                ↗
              </a>
            )}
          </div>,
        );
      }
      case "link":
        return wrap(
          <div className="flex items-center gap-1">
            <input
              className="w-full bg-transparent py-1 outline-none"
              placeholder="https://…"
              value={a.link}
              onChange={(e) => onChangeLocal(a.id, { link: e.target.value })}
              onBlur={(e) => {
                const next = e.target.value;
                window.setTimeout(() => {
                  void onPatch({ id: a.id, link: next });
                }, 50);
              }}
            />
          </div>,
        );
      case "courseId":
        return wrap(
          <select
            className="w-full bg-transparent py-1 outline-none"
            value={a.courseId || ""}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              void onPatch({ id: a.id, courseId: e.target.value || null })
            }
          >
            <option value="">—</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code || c.name}
              </option>
            ))}
          </select>,
        );
      case "status":
        return wrap(
          <select
            className="w-full bg-transparent py-1 outline-none"
            value={a.status}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              void onPatch({
                id: a.id,
                status: e.target.value as AssignmentStatus,
              })
            }
          >
            {ASSIGNMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>,
        );
      case "dueAt":
        return wrap(
          <input
            type="datetime-local"
            className="w-full bg-transparent py-1 outline-none"
            value={toInputDateTime(a.dueAt)}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              void onPatch({
                id: a.id,
                dueAt: fromInputDateTime(e.target.value),
              })
            }
          />,
        );
      case "assignmentType":
        return wrap(
          <input
            className="w-full bg-transparent py-1 outline-none"
            value={a.assignmentType}
            onChange={(e) =>
              onChangeLocal(a.id, { assignmentType: e.target.value })
            }
            onBlur={(e) => {
              const next = e.target.value;
              window.setTimeout(() => {
                void onPatch({ id: a.id, assignmentType: next });
              }, 50);
            }}
          />,
        );
      case "difficulty":
        return wrap(
          <select
            className="w-full bg-transparent py-1 outline-none"
            value={a.difficulty}
            onChange={(e) =>
              void onPatch({
                id: a.id,
                difficulty: e.target.value as AssignmentDifficulty,
              })
            }
          >
            {ASSIGNMENT_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>,
        );
      case "pointsEarned":
        return wrap(
          <input
            type="number"
            className="w-full bg-transparent py-1 outline-none"
            value={a.pointsEarned ?? ""}
            onChange={(e) =>
              void onPatch({
                id: a.id,
                pointsEarned: e.target.value ? Number(e.target.value) : null,
              })
            }
          />,
        );
      case "pointsPossible":
        return wrap(
          <input
            type="number"
            className="w-full bg-transparent py-1 outline-none"
            value={a.pointsPossible ?? ""}
            onChange={(e) =>
              void onPatch({
                id: a.id,
                pointsPossible: e.target.value ? Number(e.target.value) : null,
              })
            }
          />,
        );
      case "notes":
        return wrap(
          <input
            className="w-full bg-transparent py-1 outline-none"
            value={a.notes}
            onChange={(e) => onChangeLocal(a.id, { notes: e.target.value })}
            onBlur={(e) => {
              const next = e.target.value;
              window.setTimeout(() => {
                void onPatch({ id: a.id, notes: next });
              }, 50);
            }}
          />,
        );
      default:
        return wrap(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <button
          type="button"
          onClick={() => void onAddRow()}
          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
        >
          + Row
        </button>
        <label className="text-sm text-[var(--muted)]">
          Fill
          <select
            className="ml-1 rounded-lg border border-[var(--line)] bg-white px-2 py-1"
            value={fillMode}
            onChange={(e) => setFillMode(e.target.value as FillMode)}
          >
            <option value="weekly">weekly (+7 days)</option>
            <option value="daily">daily (+1 day)</option>
            <option value="auto">auto from pattern</option>
          </select>
        </label>
        <label className="text-sm text-[var(--muted)]">
          rows
          <input
            type="number"
            min={1}
            max={30}
            className="ml-1 w-16 rounded-lg border border-[var(--line)] bg-white px-2 py-1"
            value={fillRows}
            onChange={(e) => setFillRows(Number(e.target.value) || 1)}
          />
        </label>
        <button
          type="button"
          onClick={() => void runFillDown()}
          className="rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
        >
          Fill down
        </button>
        <span className="text-xs text-[var(--muted)]">
          Drag column headers to reorder · Title with a Link becomes clickable
        </span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-[1200px] w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--card)]">
            <tr>
              {cols.map((key) => {
                const meta = metaByKey.get(key)!;
                return (
                  <th
                    key={key}
                    draggable
                    onDragStart={() => setDragCol(key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onHeaderDrop(key)}
                    className={`cursor-grab border-b border-r border-[var(--line)] px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)] active:cursor-grabbing ${meta.width}`}
                    title="Drag to reorder"
                  >
                    {meta.label}
                  </th>
                );
              })}
              <th className="border-b border-[var(--line)] px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr
                key={a.id}
                className={`hover:bg-black/[0.02] ${
                  isSubmittedStyle(a.status)
                    ? "bg-stone-100/80 text-[var(--muted)] line-through opacity-70"
                    : ""
                }`}
              >
                {cols.map((col) => renderCell(a, col))}
                <td className="border-b border-[var(--line)] px-2 py-1">
                  <button
                    type="button"
                    className="text-xs text-red-700 no-underline"
                    style={{ textDecoration: "none" }}
                    onClick={() => void onDelete(a.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!assignments.length && (
          <p className="p-4 text-sm text-[var(--muted)]">
            No assignments yet — add a row to start.
          </p>
        )}
      </div>
    </section>
  );
}
