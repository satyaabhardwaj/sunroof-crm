"use client";
import Link from "next/link";
import { SunrooofBrand } from "./SunrooofBrand";
import { usePathname } from "next/navigation";
import {
  Menu,
  PencilRuler,
  Users,
  Ruler,
  Wallet,
  Factory,
  X,
} from "lucide-react";
import { useLayout } from "@/hooks/use-layout";
import { useRealtime } from "@/hooks/use-realtime";
import { useIdleSession } from "@/hooks/use-idle-session";
const navigation = [
  ["design", "Design", PencilRuler],
  ["design-head", "Design head", Users],
  ["measurement", "Measurement", Ruler],
  ["accounts", "Accounts", Wallet],
  ["factory", "Factory", Factory],
] as const;
export function DashboardShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const path = usePathname();
  const { sidebarOpen, setSidebarOpen } = useLayout();
  useRealtime();
  useIdleSession();
  return (
    <>
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur">
        <Link
          href="/design"
          className="text-2xl font-black tracking-tight"
          aria-label="Sunrooof home"
        >
          <SunrooofBrand />
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-slate-500 sm:block">
            Post-design workspace
          </span>
          <span className="hidden text-sm text-slate-600 md:block">
            {email}
          </span>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(
                () => undefined,
              );
              location.assign("/login");
            }}
          >
            Sign out
          </button>
          <button
            className="p-2 md:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <div className="mx-auto flex max-w-screen-2xl">
        <aside
          className={`${sidebarOpen ? "block" : "hidden"} fixed inset-x-0 top-20 z-10 border-b bg-white p-4 md:sticky md:top-20 md:block md:h-[calc(100vh-5rem)] md:w-56 md:shrink-0 md:border-b-0 md:bg-transparent`}
        >
          <nav aria-label="Departments" className="space-y-2">
            {navigation.map(([id, label, Icon]) => (
              <Link
                key={id}
                href={`/${id}`}
                onClick={() => setSidebarOpen(false)}
                aria-current={path === `/${id}` ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${path === `/${id}` ? "bg-[#E9E8F8] font-semibold text-primary" : "text-slate-600 hover:bg-white"}`}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-5 md:p-8">{children}</main>
      </div>
    </>
  );
}
