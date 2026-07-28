"use client";

import Link from "next/link";
import { useUiTheme } from "@/components/ThemePicker";

const NAV = [
  { href: "/admin", label: "Home" },
  { href: "/admin/assignments", label: "Assignments" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/lists", label: "Lists" },
  { href: "/admin/reminders", label: "Reminders" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useUiTheme();

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-5 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            SMS assistant
          </p>
          <h1 className="display text-3xl">Dashboard</h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-sm hover:bg-[var(--accent-soft)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
