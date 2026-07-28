"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUiTheme } from "@/components/ThemePicker";

const NAV = [
  { href: "/admin", label: "Home" },
  { href: "/admin/todo", label: ".todo" },
  { href: "/admin/assignments", label: "Assignments" },
  { href: "/admin/applications", label: "Applications" },
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
  const pathname = usePathname();

  return (
    <div className="mx-auto min-h-screen w-full max-w-[100rem] px-3 py-3 sm:px-5 sm:py-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="display text-xl leading-none sm:text-2xl">Dashboard</h1>
          <span className="hidden text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] sm:inline">
            SMS
          </span>
        </div>
        <nav className="flex flex-wrap gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white/70 hover:bg-[var(--accent-soft)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
