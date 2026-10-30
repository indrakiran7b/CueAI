"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  FileText,
  GraduationCap,
  MoreHorizontal,
  LogOut,
  User,
  type LucideIcon,
} from "lucide-react";
import { BrandMark, Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getDesktop, isDesktopApp } from "@/lib/desktop";
import { CUEAI_NAV, isAdminUser } from "@/lib/app-access";
import { isMacDesktopApp } from "@/lib/desktop";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { withDesktopParam } from "@/lib/desktop-query";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/resume": FileText,
  "/mock-interview": GraduationCap,
  "/meetings/live": Sparkles,
  "/meetings": Video,
  "/knowledge": Library,
  "/screen-context": Monitor,
  "/translation": Languages,
  "/admin": Shield,
  "/settings": Settings,
};

const nav = CUEAI_NAV.map((item) => ({ ...item, icon: ICONS[item.href] ?? LayoutDashboard }));

const MAC_SECTIONS = [
  {
    title: "CUE AI",
    hrefs: ["/dashboard", "/resume", "/mock-interview", "/meetings/live", "/meetings"],
  },
  {
    title: "Workspace",
    hrefs: ["/knowledge", "/screen-context", "/translation", "/admin"],
  },
  {
    title: "Settings",
    hrefs: ["/settings"],
  },
] as const;

function isNavActive(pathname: string, href: string, liveMode: string | null): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  if (href.includes("mode=mock")) {
    return pathname === "/meetings/live" && liveMode === "mock";
  }
  if (href === "/meetings/live") {
    if (pathname !== "/meetings/live") return false;
    return liveMode !== "mock";
  }
  if (href === "/meetings") {
    if (pathname === "/meetings") return true;
    if (!pathname.startsWith("/meetings/")) return false;
    return (
      pathname !== "/meetings/live" && !pathname.startsWith("/meetings/live/")
    );
  }
  if (href === "/settings") {
    return pathname === "/settings" || pathname.startsWith("/settings/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const liveMode = searchParams.get("mode");
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mac] = useState(() => isMacDesktopApp());
  const [desktop] = useState(() => typeof window !== "undefined" && isDesktopApp());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { session, logout } = useAuth();
  const admin = isAdminUser(session?.role);

  const items = nav.filter((item) => !item.adminOnly || admin);

  function navHref(href: string) {
    if (href.startsWith("/meetings/live")) {
      return withDesktopParam(href);
    }
    return href;
  }

  function renderLink(item: { href: string; label: string; icon: typeof LayoutDashboard }) {
    const active = isNavActive(pathname, item.href, liveMode);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={navHref(item.href)}
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
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && active && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground not-mac" />
        )}
      </Link>
    );
  }

  async function handleLogout() {
    setUserMenuOpen(false);
    try {
      await getDesktop()?.hideCompanion?.();
    } catch {
      /* companion may already be closed */
    }
    await logout();
    router.push(withDesktopParam("/login"));
  }

  return (
    <aside
      className={cn(
        "mac-sidebar sticky top-0 z-30 flex h-screen min-w-0 flex-col border-r border-[var(--border)] bg-[var(--background-elevated)] transition-all duration-300",
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
        {!desktop && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && !mac && (
        <div className="border-b border-[var(--border)] px-3 py-3">
          <WorkspaceSwitcher variant="sidebar" />
        </div>
      )}

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

      {!collapsed && session && !mac && (
        <div className="cue-sidebar-foot">
          <div className="cue-sidebar-user-card" ref={userMenuRef}>
            <Avatar name={session.name || session.email || "User"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.name || "User"}</p>
              <p className="truncate text-xs text-muted">{session.email}</p>
            </div>
            <div className="cue-sidebar-user-menu">
              <button
                type="button"
                className="cue-sidebar-user-menu-btn"
                aria-label="Account menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((o) => !o)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {userMenuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    aria-label="Close account menu"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]">
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <User className="h-3.5 w-3.5" />
                      Profile
                    </Link>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Settings
                    </Link>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
                      onClick={() => void handleLogout()}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
