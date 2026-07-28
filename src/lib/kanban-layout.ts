import type { CSSProperties } from "react";

/** Responsive kanban: columns share width and shrink to fit; scroll only if too tight. */
export function kanbanBoardStyle(columnCount: number): CSSProperties {
  const n = Math.max(1, columnCount);
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${n}, minmax(min(100%, 9.5rem), 1fr))`,
    gap: "0.65rem",
    width: "100%",
    alignItems: "start",
  };
}

export const kanbanBoardClass = "w-full overflow-x-auto pb-1";

export const kanbanColumnClass =
  "min-w-0 rounded-2xl border p-2 sm:p-3 flex flex-col max-h-[calc(100vh-9.5rem)]";

export const kanbanColumnBodyClass =
  "min-h-20 flex-1 space-y-1.5 overflow-y-auto";
