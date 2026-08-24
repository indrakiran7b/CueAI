"use client";

import {
  Bell,
  Command,
  Moon,
  Search,
  Sun,
  ChevronDown,
  Plus,
  LogOut,
  Video,
  FileText,
  BookOpen,
  Settings,
  Check,
} from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { openCompanionOverlay, toggleCompanionOverlay } from "@/lib/desktop";
import Link from "next/link";
import { useRouter } from "next/navigation";

const INITIAL_NOTIFS = [
  { id: "n1", text: "Welcome to CueAI — your workspace is ready", href: "/dashboard" },
  { id: "n2", text: "Try starting a live meeting session", href: "/meetings/live" },
  { id: "n3", text: "Upload docs to your Knowledge Base", href: "/knowledge" },
];

const COMMAND_LINKS = [
  { label: "Start live meeting", href: "/meetings/live", icon: Video },
  { label: "Meetings", href: "/meetings", icon: FileText },
  { label: "Knowledge Base", href: "/knowledge", icon: BookOpen },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const { session, logout } = useAuth();
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [notifs, setNotifs] = useState(INITIAL_NOTIFS);
  const [readIds, setReadIds] = useState<string[]>([]);
  // Avoid SSR/client mismatch: cueDesktop / bridge only exist after mount.
  const [desktopReady, setDesktopReady] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { isDesktopAvailable } = await import("@/lib/desktop");
      const ok = await isDesktopAvailable();
      if (!cancelled) setDesktopReady(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    commandInputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen]);

  const displayName = session?.name || "Guest";
  const workspace = session?.workspace || "CueAI";
  const initial = displayName.trim().charAt(0).toUpperCase() || "C";
  const unread = notifs.filter((n) => !readIds.includes(n.id)).length;

  const filteredCommands = COMMAND_LINKS.filter((c) =>
    c.label.toLowerCase().includes(commandQuery.trim().toLowerCase())
  );

  async function handleLogout() {
    await logout();
    setProfileOpen(false);
    router.push("/");
  }

  async function handleCompanion() {
    await toggleCompanionOverlay();
  }

  function handleStartMeeting() {
    void openCompanionOverlay();
    router.push("/meetings/live");
  }

  function closeMenus() {
    setNotifOpen(false);
    setProfileOpen(false);
    setWorkspaceOpen(false);
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)]/80 px-4 backdrop-blur-xl sm:px-6">
      <div className="relative hidden md:block">
        <button
          type="button"
          onClick={() => {
            setWorkspaceOpen((o) => !o);
            setNotifOpen(false);
            setProfileOpen(false);
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-1.5 text-sm transition hover:border-[var(--border-strong)]"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-[var(--background)]">
            {initial}
          </span>
          <span className="max-w-[140px] truncate font-medium">{workspace}</span>
          <ChevronDown className="h-3.5 w-3.5 text-subtle" />
        </button>
        {workspaceOpen && (
          <div className="absolute left-0 top-11 w-56 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]">
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Workspace
            </p>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground"
              onClick={() => setWorkspaceOpen(false)}
            >
              <Check className="h-3.5 w-3.5 text-foreground" />
              {workspace}
            </button>
            <Link
              href="/settings"
              className="mt-1 block rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
              onClick={() => setWorkspaceOpen(false)}
            >
              Workspace settings
            </Link>
            <Link
              href="/dashboard"
              className="block rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
              onClick={() => setWorkspaceOpen(false)}
            >
              Dashboard
            </Link>
          </div>
        )}
      </div>

      <button
        type="button"
        data-command-trigger
        onClick={() => {
          closeMenus();
          setCommandOpen(true);
          setCommandQuery("");
        }}
        className="group flex h-9 max-w-md flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 text-sm text-subtle transition hover:border-[var(--border-strong)]"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search meetings, docs, answers…</span>
        <kbd className="hidden items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] font-medium text-subtle sm:inline-flex">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleCompanion()}
        >
          Companion
        </Button>
        <Button
          size="sm"
          variant="primary"
          className="hidden sm:inline-flex"
          onClick={handleStartMeeting}
        >
          <Plus className="h-3.5 w-3.5" />
          Start Meeting
        </Button>

        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
          aria-label="Toggle theme"
          suppressHydrationWarning
        >
          <span suppressHydrationWarning>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </span>
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setNotifOpen((o) => !o);
              setProfileOpen(false);
              setWorkspaceOpen(false);
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-11 w-80 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Notifications
                </p>
                {notifs.length > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-[var(--accent)] hover:underline"
                    onClick={() => {
                      setReadIds(notifs.map((n) => n.id));
                      setNotifs([]);
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>
              {notifs.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted">You&apos;re all caught up</p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={cn(
                      "flex w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-hover)] hover:text-foreground",
                      readIds.includes(n.id) ? "text-subtle" : "text-muted"
                    )}
                    onClick={() => {
                      setReadIds((ids) => (ids.includes(n.id) ? ids : [...ids, n.id]));
                      setNotifOpen(false);
                      router.push(n.href);
                    }}
                  >
                    {n.text}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((o) => !o);
              setNotifOpen(false);
              setWorkspaceOpen(false);
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-[var(--surface-hover)]"
            )}
          >
            <Avatar name={displayName} size="sm" />
            <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline">
              {displayName}
            </span>
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-11 w-56 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]">
              {session ? (
                <>
                  <div className="border-b border-[var(--border)] px-3 py-2">
                    <p className="truncate text-sm font-medium">{session.name}</p>
                    <p className="truncate text-xs text-subtle">{session.email}</p>
                  </div>
                  <Link
                    href="/settings"
                    className="mt-1 block rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--surface-hover)]"
                    onClick={() => setProfileOpen(false)}
                  >
                    Create account
                  </Link>
                  <Link
                    href="/login"
                    className="block rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {commandOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
              <Search className="h-4 w-4 text-subtle" />
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Jump to…"
                className="h-12 flex-1 bg-transparent text-sm outline-none"
              />
              <kbd className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-subtle">
                Esc
              </kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">No matches</p>
              ) : (
                filteredCommands.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-hover)]"
                      onClick={() => {
                        setCommandOpen(false);
                        if (item.href === "/meetings/live") {
                          void openCompanionOverlay();
                        }
                        router.push(item.href);
                      }}
                    >
                      <Icon className="h-4 w-4 text-subtle" />
                      {item.label}
                    </button>
                  );
                })
              )}
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-hover)]"
                onClick={() => {
                  setCommandOpen(false);
                  void handleCompanion();
                }}
              >
                <Command className="h-4 w-4 text-subtle" />
                {desktopReady ? "Toggle Desktop companion" : "Open companion (Desktop if available)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
