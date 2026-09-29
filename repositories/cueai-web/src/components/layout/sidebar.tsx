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
  Library,
  PanelLeft,
  AppWindow,
} from "lucide-react";
import { BrandMark, Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { isAdminUser, isCueAiUserNavHref } from "@/lib/app-access";
import { isMacDesktopApp } from "@/lib/desktop";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/meetings/live", label: "Live Session", icon: Sparkles },
  { href: "/knowledge", label: "Knowledge Base", icon: Library, adminOnly: true as const },
  { href: "/translation", label: "Translation", icon: Languages, adminExtra: true as const },
  { href: "/screen-context", label: "Screen Context", icon: Monitor, adminExtra: true as const },
  { href: "/companion", label: "Desktop Companion", icon: AppWindow },
  { href: "/admin", label: "Admin Portal", icon: Shield, adminOnly: true as const },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MAC_SECTIONS = [
  {
    title: "CUE AI",
    hrefs: ["/dashboard", "/meetings", "/meetings/live", "/companion"],
  },
  {
    title: "Workspace",
    hrefs: ["/knowledge", "/translation", "/screen-context", "/admin"],
  },
  {
    title: "Settings",
    hrefs: ["/settings"],
  },
] as const;

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
  const admin = isAdminUser(session?.role);

  const items = nav.filter((item) => {
    if ("adminOnly" in item && item.adminOnly) return admin;
    if ("adminExtra" in item && item.adminExtra) return admin;
    return isCueAiUserNavHref(item.href);
  });

  function renderLink(item: (typeof nav)[number], hudLabel = false) {
    const active = isNavActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 mac-nav-item",
          active
            ? "mac-nav-active bg-[var(--surface-active)] text-foreground"
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
        {!collapsed && (
          <span className="truncate">
            {item.label === "Desktop Companion" && hudLabel ? "Meeting HUD" : item.label}
          </span>
        )}
        {!collapsed && active && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground not-mac" />
        )}
      </Link>
    );
  }

  return (
    <aside
      className={cn(
        "mac-sidebar sticky top-0 z-30 flex h-screen flex-col border-r border-[var(--border)] bg-[var(--background-elevated)] transition-all duration-300",
        collapsed && !mac ? "w-[72px]" : "w-[var(--sidebar-width)]"
      )}
    >
      <div className="mac-only mac-sidebar-brand">
        <span>CueAI</span>
      </div>
      <div
        className={cn(
          "not-mac flex items-center border-b border-[var(--border)]",
          collapsed ? "flex-col gap-1 px-2 py-3" : "h-14 justify-between px-3"
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
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="cue-scroll flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        <div className="mac-only">
          {MAC_SECTIONS.map((section) => {
            const sectionItems = items.filter((item) =>
              (section.hrefs as readonly string[]).includes(item.href)
            );
            if (sectionItems.length === 0) return null;
            return (
              <div key={section.title} className="mac-nav-section">
                <p>{section.title}</p>
                {sectionItems.map((item) => renderLink(item))}
              </div>
            );
          })}
        </div>
        <div className="not-mac space-y-0.5">{items.map((item) => renderLink(item))}</div>
      </nav>
    </aside>
  );
}
