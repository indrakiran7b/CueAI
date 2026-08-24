"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  FileText,
  Library,
  Languages,
  Monitor,
  Settings,
  Shield,
  Sparkles,
  PanelLeft,
  AppWindow,
  Palette,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { useState } from "react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/meetings/live", label: "Live Session", icon: Sparkles },
  { href: "/resume", label: "Resume Tailor", icon: FileText },
  { href: "/knowledge", label: "Knowledge Base", icon: Library },
  { href: "/translation", label: "Translation", icon: Languages },
  { href: "/screen-context", label: "Screen Context", icon: Monitor },
  { href: "/companion", label: "Desktop Companion", icon: AppWindow },
  { href: "/admin", label: "Admin Portal", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/design-system", label: "Design System", icon: Palette },
];

/** Avoid `/meetings` staying active on `/meetings/live` (and similar overlaps). */
function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  if (href === "/meetings/live") {
    return pathname === "/meetings/live" || pathname.startsWith("/meetings/live/");
  }
  if (href === "/meetings") {
    if (pathname === "/meetings") return true;
    if (!pathname.startsWith("/meetings/")) return false;
    return (
      pathname !== "/meetings/live" && !pathname.startsWith("/meetings/live/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 flex h-screen flex-col border-r border-[var(--border)] bg-[var(--background-elevated)] transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[var(--sidebar-width)]"
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-[var(--border)]",
          collapsed
            ? "flex-col gap-1 px-2 py-3"
            : "h-14 justify-between px-3"
        )}
      >
        {collapsed ? (
          <Link
            href="/dashboard"
            aria-label="CueAI"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-[var(--background)]"
          >
            <Sparkles className="h-4 w-4" />
          </Link>
        ) : (
          <Logo size="sm" href="/dashboard" />
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="cue-scroll flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {!collapsed && (
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
            Workspace
          </p>
        )}
        {nav.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-[var(--surface-active)] text-foreground"
                  : "text-muted hover:bg-[var(--surface-hover)] hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105",
                  active && "text-foreground"
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
