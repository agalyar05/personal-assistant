"use client";

import { useCallback, useRef, useState } from "react";

/** Offers a single-step "undo the last thing" toast that expires after `timeoutMs`. */
export function useUndoToast(timeoutMs = 10000) {
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(
    null,
  );
  const timerRef = useRef<number | null>(null);

  const offerUndo = useCallback(
    (label: string, run: () => void) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setPending({ label, run });
      timerRef.current = window.setTimeout(() => setPending(null), timeoutMs);
    },
    [timeoutMs],
  );

  const runUndo = useCallback(() => {
    // Side effect (calling .run()) deliberately kept OUTSIDE the setState
    // updater — React (StrictMode, in dev) can invoke updater functions more
    // than once, which previously caused the restored item to be duplicated.
    if (!pending) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const toRun = pending;
    setPending(null);
    toRun.run();
  }, [pending]);

  const dismiss = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setPending(null);
  }, []);

  return { pending, offerUndo, runUndo, dismiss };
}
