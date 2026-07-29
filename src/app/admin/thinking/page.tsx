"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingSheet } from "@/components/ThinkingSheet";
import {
  DEFAULT_THINKING_SHEET,
  normalizeThinkingSheet,
  type ThinkingSheetData,
} from "@/lib/sheet-formulas";

const LOCAL_KEY = "pa_thinking_sheet";

export default function ThinkingPage() {
  const [sheet, setSheet] = useState<ThinkingSheetData>(DEFAULT_THINKING_SHEET);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("");
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let local: ThinkingSheetData | null = null;
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) local = normalizeThinkingSheet(JSON.parse(raw));
      } catch {
        /* ignore */
      }
      if (local && !cancelled) {
        setSheet(local);
        setReady(true);
      }
      try {
        const res = await fetch("/api/thinking");
        const json = await res.json();
        if (cancelled) return;
        const remote = normalizeThinkingSheet(json.sheet);
        const remoteEmpty = Object.keys(remote.cells).length === 0;
        if (!remoteEmpty || !local) {
          setSheet(remote);
          try {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(remote));
          } catch {
            /* ignore */
          }
        } else if (local && Object.keys(local.cells).length) {
          void fetch("/api/thinking", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sheet: local }),
          });
        }
      } catch {
        if (!local && !cancelled) setSheet(DEFAULT_THINKING_SHEET);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onChange(next: ThinkingSheetData) {
    setSheet(next);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void fetch("/api/thinking", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet: next }),
      }).then(async (res) => {
        if (!res.ok) setMsg("Cloud save failed — kept locally");
        else setMsg("");
      });
    }, 600);
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Loading thinking sheet…</p>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
        <h2 className="display text-xl leading-tight">Thinking</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Scratch spreadsheet — drag to select, formulas like{" "}
          <code className="text-[var(--ink)]">=SUM(A1:A10)</code>,{" "}
          <code className="text-[var(--ink)]">=AVG(B1:B5)</code>,{" "}
          <code className="text-[var(--ink)]">=C1*1.1</code>. Autosaves.
        </p>
        {msg && <p className="mt-2 text-sm text-[var(--accent)]">{msg}</p>}
      </section>
      <ThinkingSheet data={sheet} onChange={onChange} />
    </div>
  );
}
