"use client";

export function UndoToast({
  label,
  onUndo,
  onDismiss,
}: {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--ink)] px-4 py-2 text-sm text-white shadow-lg">
      <span className="max-w-[60vw] truncate">{label}</span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 font-semibold underline underline-offset-2"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-white/60 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
