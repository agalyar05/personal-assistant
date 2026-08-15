import type { CSSProperties } from "react";

/** Responsive kanban: columns share width; each column fills viewport height. */
export function kanbanBoardStyle(
  columnCount: number,
  offsetRem = 10.5,
): CSSProperties {
  const n = Math.max(1, columnCount);
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${n}, minmax(min(100%, 9.5rem), 1fr))`,
    gap: "0.65rem",
    width: "100%",
    alignItems: "stretch",
    minHeight: `calc(100vh - ${offsetRem}rem)`,
  };
}

export const kanbanBoardClass = "w-full overflow-x-auto pb-1";

export const kanbanColumnClass =
  "min-w-0 min-h-[calc(100vh-10.5rem)] rounded-2xl border p-2 sm:p-3 flex flex-col h-[calc(100vh-10.5rem)]";

/** Scroll only the card list when a column overflows. */
export const kanbanColumnBodyClass =
  "min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden";

/** dataTransfer type used to tell a column-header drag apart from a card drag. */
export const KANBAN_COLUMN_DRAG_TYPE = "application/x-kanban-column-id";

/**
 * Orders `ids` per a user's saved drag order, keeping any id not (yet) in
 * `savedOrder` — a newly added column — appended at the end in its original
 * relative position.
 */
export function applyColumnOrder<T extends string>(
  ids: T[],
  savedOrder: string[] | undefined,
): T[] {
  if (!savedOrder?.length) return ids;
  const idSet = new Set(ids);
  const known = savedOrder.filter((id): id is T => idSet.has(id as T));
  const knownSet = new Set(known);
  const rest = ids.filter((id) => !knownSet.has(id));
  return [...known, ...rest];
}

/** Pure reorder: moves `draggedId` to just before `beforeId` (or to the end). */
export function reorderColumnIds<T extends string>(
  ids: T[],
  draggedId: T,
  beforeId: T | null,
): T[] {
  const rest = ids.filter((id) => id !== draggedId);
  if (!beforeId || beforeId === draggedId) return [...rest, draggedId];
  const at = rest.indexOf(beforeId);
  if (at < 0) return [...rest, draggedId];
  return [...rest.slice(0, at), draggedId, ...rest.slice(at)];
}
