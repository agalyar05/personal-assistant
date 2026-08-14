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

/** Same as kanbanColumnClass, but leaves extra room for a page with a fixed bottom bar. */
export const kanbanColumnClassWithFooter =
  "min-w-0 min-h-[calc(100vh-19.5rem)] rounded-2xl border p-2 sm:p-3 flex flex-col h-[calc(100vh-19.5rem)]";

/** Scroll only the card list when a column overflows. */
export const kanbanColumnBodyClass =
  "min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden";
