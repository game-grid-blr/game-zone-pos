"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, History, KeyRound, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { clsx } from "clsx";
import type { UserSummary } from "@/types/pos";
import { Button } from "@/components/Button";
import { PasswordChangeModal } from "@/components/PasswordChangeModal";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/reports", label: "Reports", icon: BarChart3, admin: true },
  { href: "/settings", label: "Settings", icon: Settings, admin: true }
];

export function AppShell({ user, children }: { user: UserSummary; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-paper text-ink dark:bg-[#101214] dark:text-white">
      <header className="no-print sticky top-0 z-40 border-b border-black/10 bg-paper/95 backdrop-blur dark:border-white/10 dark:bg-[#101214]/95">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-pool text-lg font-black text-white">
              FG
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black">Fort Game Zone</span>
              <span className="block truncate text-xs font-semibold uppercase tracking-wide text-black/55 dark:text-white/55">
                POS Session Manager
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {nav
              .filter((item) => !item.admin || user.role === "ADMIN")
              .map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-bold transition",
                      active
                        ? "bg-ink text-white dark:bg-white dark:text-ink"
                        : "text-black/65 hover:bg-black/5 dark:text-white/65 dark:hover:bg-white/10"
                    )}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-bold">{user.name}</div>
              <div className="text-xs font-semibold text-black/55 dark:text-white/55">{user.role}</div>
            </div>
            <Button tone="quiet" size="sm" icon={<KeyRound size={18} />} onClick={() => setChangingPassword(true)} title="Change password">
              <span className="hidden lg:inline">Password</span>
            </Button>
            <Button tone="quiet" size="sm" icon={<LogOut size={18} />} onClick={handleLogout} title="Log out">
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-[1500px] gap-2 overflow-x-auto px-4 pb-3 md:hidden">
          {nav
            .filter((item) => !item.admin || user.role === "ADMIN")
            .map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-bold",
                    active ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-white/80 dark:bg-white/10"
                  )}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
        </nav>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">{children}</main>
      {changingPassword ? <PasswordChangeModal onClose={() => setChangingPassword(false)} /> : null}
    </div>
  );
}
