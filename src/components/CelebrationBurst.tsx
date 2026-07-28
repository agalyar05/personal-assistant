"use client";

import { useEffect, useMemo, useState } from "react";

const KITTIES = [
  String.raw`
 /\_/\
( o.o )
 > ^ <
 yay!
`,
  String.raw`
  /\_/\  
 ( ^.^ ) 
  > ^ <  
 mlem~
`,
  String.raw`
   |\__/,|   (\
 _.|o o  |_   ) )
-(((---(((--------
  party!
`,
  String.raw`
  ∧＿∧
 ( ･ω･｡)
 / つ♡
 nice!
`,
  String.raw`
 /\_/\
(='_' )
 (")(")
  done!
`,
  String.raw`
   ／l、
 （ﾟ､ ｡ ７
  l、 ~ヽ
  じしf_, )ノ
  wow!
`,
  String.raw`
  ∩――――∩
  ||  ∧  ∧ ||
  || (◕ᴗ◕) ||
  |ﾉ  つ つ |
   しーーＪ
  go you!
`,
  String.raw`
 (=^･ω･^=)
    ∪ ∪
  confetti!
`,
];

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
  size: number;
};

function themeColors(): string[] {
  if (typeof window === "undefined") {
    return ["#0f766e", "#c2410c", "#4d7c0f", "#1d4ed8", "#be185d"];
  }
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim() || "#0f766e";
  const soft = styles.getPropertyValue("--accent-soft").trim() || "#ccfbf1";
  const ink = styles.getPropertyValue("--ink").trim() || "#1c1917";
  const muted = styles.getPropertyValue("--muted").trim() || "#78716c";
  return [accent, soft, ink, muted, "#fbbf24", "#fb7185", "#38bdf8"];
}

export function CelebrationBurst({
  open,
  onDone,
  label = "Nice!",
}: {
  open: boolean;
  onDone?: () => void;
  label?: string;
}) {
  const [kitty, setKitty] = useState(KITTIES[0]!);
  const particles = useMemo(() => {
    if (!open) return [] as Particle[];
    const colors = themeColors();
    return Array.from({ length: 48 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      duration: 1.4 + Math.random() * 1.2,
      color: colors[i % colors.length]!,
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 8,
    }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setKitty(KITTIES[Math.floor(Math.random() * KITTIES.length)]!);
    const t = window.setTimeout(() => onDone?.(), 2200);
    return () => window.clearTimeout(t);
  }, [open, onDone]);

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="pa-confetti-piece absolute top-[-12px]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            background: p.color,
            borderRadius: 2,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="pa-pop rounded-3xl border border-[var(--line)] bg-[var(--card)]/95 px-8 py-6 shadow-lg backdrop-blur">
          <pre className="whitespace-pre font-mono text-sm leading-tight text-[var(--ink)]">
            {kitty}
          </pre>
          <p className="mt-3 text-center text-sm font-medium text-[var(--accent)]">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
