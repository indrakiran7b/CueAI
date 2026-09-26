"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  Languages,
  Monitor,
  Settings,
  Shield,
  Sparkles,
  PanelLeft,
  AppWindow,
  Library,
  type LucideIcon,
} from "lucide-react";
import { BrandMark, Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { visibleCueAiNav, type CueAiNavItem } from "@/lib/app-access";
import { isMacDesktopApp } from "@/lib/desktop";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/meetings": Video,
  "/meetings/live": Sparkles,
  "/translation": Languages,
  "/companion": AppWindow,
  "/screen-context": Monitor,
  "/knowledge": Library,
  "/admin": Shield,
  "/settings": Settings,
};

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
  const [mac] = useState(() => isMacDesktopApp());
  const { session } = useAuth();
  const items = visibleCueAiNav(session?.role);
  const primary = items.filter((item) => !item.pinBottom);
  const footer = items.filter((item) => item.pinBottom);

  function renderLink(item: CueAiNavItem) {
    const active = isNavActive(pathname, item.href);
    const Icon = NAV_ICONS[item.href] || LayoutDashboard;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          "mac-nav-item group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
          active
            ? "mac-nav-active bg-[var(--surface-active)] text-foreground"
            : "text-muted hover:bg-[var(--surface-hover)] hover:text-foreground",
          collapsed && "justify-center px-2"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
            active && "text-foreground"
          )}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  return (
    <aside
      className={cn(
        "mac-sidebar sticky top-0 z-20 flex h-full min-h-0 flex-col border-r border-[var(--border)] bg-[var(--background-elevated)] transition-all duration-300",
        collapsed && !mac ? "w-[72px]" : "w-[var(--sidebar-width)]"
      )}
    >
      <div
        className={cn(
          "mac-sidebar-brand flex items-center border-b border-[var(--border)]",
          collapsed ? "flex-col gap-1 px-2 py-3" : "h-12 justify-between px-3"
        )}
      >
        {collapsed ? (
          <Link href="/dashboard" aria-label="CueAI" className="flex h-8 w-8 items-center justify-center">
            <BrandMark size="sm" />
          </Link>
        ) : (
          <Logo size="sm" href="/dashboard" />
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="cue-scroll flex-1 space-y-0.5 overflow-y-auto px-2 py-2.5">
        {primary.map((item) => renderLink(item))}
      </nav>
      <div className="mt-auto space-y-0.5 border-t border-[var(--border)] px-2 py-2.5">
        {footer.map((item) => renderLink(item))}
      </div>
    </aside>
  );
}
