"use client";

import {
  Bell,
  Command,
  Moon,
  Search,
  Sun,
  ChevronDown,
  LogOut,
  Video,
  FileText,
  Settings,
  BookOpen,
  Check,
  User,
  Shield,
  Palette,
} from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getDesktop } from "@/lib/desktop";
import { isAdminUser, safeCueAiHref, visibleCueAiNav } from "@/lib/app-access";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { withDesktopParam } from "@/lib/desktop-query";

type AppNotification = {
  id: string;
  title: string;
  body?: string;
  href: string;
  createdAt: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  current?: boolean;
};

const COMMAND_LINKS = [
  { label: "Start live meeting", href: "/meetings/live", icon: Video },
  { label: "Meetings", href: "/meetings", icon: FileText },
  { label: "Desktop Companion", href: "/companion", icon: Video },
  { label: "Knowledge Base", href: "/knowledge", icon: BookOpen, adminOnly: true as const },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const { session, logout } = useAuth();
  const admin = isAdminUser(session?.role);
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [meetingHits, setMeetingHits] = useState<{ id: string; title: string }[]>([]);
  const [macDesktop, setMacDesktop] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { isMacDesktopApp } = await import("@/lib/desktop");
      if (!cancelled) setMacDesktop(isMacDesktopApp());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.userId) {
      setReadIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`cueai-notif-read:${session.userId}`);
      setReadIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setReadIds([]);
    }
  }, [session?.userId]);

  useEffect(() => {
    if (!session?.userId) {
      setNotifs([]);
      return;
    }
    let cancelled = false;
    void fetch("/api/notifications", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load notifications.");
        return res.json() as Promise<{ notifications?: AppNotification[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setNotifs(data.notifications || []);
        setNotifError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setNotifs([]);
          setNotifError("Unable to load notifications.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  useEffect(() => {
    if (!session?.userId) {
      setWorkspaces([]);
      return;
    }
    let cancelled = false;
    void fetch("/api/workspaces", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load workspaces.");
        return res.json() as Promise<{ workspaces?: WorkspaceRow[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setWorkspaces(data.workspaces || []);
        setWorkspaceError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaces([]);
          setWorkspaceError("Unable to load workspaces.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  useEffect(() => {
    if (!commandOpen) return;
    commandInputRef.current?.focus();
    let cancelled = false;
    void fetch("/api/meetings", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return { meetings: [] as { id: string; title: string }[] };
        return res.json() as Promise<{ meetings?: { id: string; title: string }[] }>;
      })
      .then((data) => {
        if (!cancelled) setMeetingHits(data.meetings || []);
      })
      .catch(() => {
        if (!cancelled) setMeetingHits([]);
      });
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        closeMenus();
        setCommandOpen(true);
        setCommandQuery("");
        return;
      }
      if (e.key === "Escape") {
        setCommandOpen(false);
        closeMenus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [commandOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
        setCommandQuery("");
      }
      if (macDesktop && e.metaKey && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
      if (e.key === "Escape") closeMenus();
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && headerRef.current?.contains(target)) return;
      closeMenus();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [macDesktop, router]);

  const displayName = session?.name || "Guest";
  const workspace =
    workspaces.find((row) => row.current)?.name || session?.workspace || "CueAI";
  const unread = notifs.filter((n) => !readIds.includes(n.id)).length;
  const q = commandQuery.trim().toLowerCase();
  const allowedHrefs = new Set(visibleCueAiNav(session?.role).map((item) => item.href));
  const filteredCommands = COMMAND_LINKS.filter((c) => {
    if (c.href !== "/meetings/live" && !allowedHrefs.has(c.href)) return false;
    if ("adminOnly" in c && c.adminOnly && !admin) return false;
    return !q || c.label.toLowerCase().includes(q);
  });
  const filteredMeetings = meetingHits.filter((m) => !q || m.title.toLowerCase().includes(q));

  function persistRead(ids: string[]) {
    setReadIds(ids);
    if (session?.userId) {
      localStorage.setItem(`cueai-notif-read:${session.userId}`, JSON.stringify(ids));
    }
  }

  async function handleLogout() {
    closeMenus();
    try {
      await getDesktop()?.hideCompanion?.();
    } catch {
      /* companion may already be closed */
    }
    await logout();
    router.push(withDesktopParam("/login"));
  }

  function closeMenus() {
    setNotifOpen(false);
    setProfileOpen(false);
    setWorkspaceOpen(false);
  }

  async function selectWorkspace(id: string) {
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setWorkspaceError(data.error || "Unable to switch workspace.");
        return;
      }
      setWorkspaces((rows) => rows.map((row) => ({ ...row, current: row.id === id })));
      setWorkspaceOpen(false);
      router.refresh();
    } catch {
      setWorkspaceError("Unable to switch workspace.");
    }
  }

  return (
    <header
      ref={headerRef}
      className={cn(
        "mac-toolbar sticky top-0 z-20 flex h-12 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--background)]/80 px-3 backdrop-blur-xl sm:px-4"
      )}
      style={macDesktop ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
    >
      <div
        className="relative hidden md:block"
        style={macDesktop ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
      >
        <button
          type="button"
          onClick={() => {
            setWorkspaceOpen((o) => !o);
            setNotifOpen(false);
            setProfileOpen(false);
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-1.5 text-sm transition hover:border-[var(--border-strong)]"
        >
          <span className="max-w-[140px] truncate font-medium">{workspace}</span>
          <ChevronDown className="h-3.5 w-3.5 text-subtle" />
        </button>
        {workspaceOpen && (
          <div className="absolute left-0 top-11 z-50 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]">
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Workspace
            </p>
            {workspaceError && (
              <p className="px-3 py-2 text-sm text-[var(--cue-danger)]">{workspaceError}</p>
            )}
            {workspaces.length === 0 && !workspaceError ? (
              <p className="px-3 py-3 text-sm text-muted">No workspace yet.</p>
            ) : (
              workspaces.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-[var(--surface-hover)]"
                  onClick={() => void selectWorkspace(row.id)}
                >
                  {row.current ? <Check className="h-3.5 w-3.5 text-foreground" /> : <span className="w-3.5" />}
                  {row.name}
                </button>
              ))
            )}
            <Link
              href="/settings"
              className="mt-1 block rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
              onClick={() => setWorkspaceOpen(false)}
            >
              Workspace settings
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
        className="mac-toolbar-search group flex h-9 max-w-md flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 text-sm text-subtle transition hover:border-[var(--border-strong)]"
        style={macDesktop ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search meetings, docs, answers…</span>
        <kbd className="hidden items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] font-medium text-subtle sm:inline-flex">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      <div
        className="ml-auto flex items-center gap-1.5 sm:gap-2"
        style={macDesktop ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
      >
        <button
          type="button"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-1.5 text-sm font-medium transition hover:border-[var(--border-strong)] hover:text-foreground"
          onClick={() => router.push(withDesktopParam("/settings?section=billing"))}
        >
          Upgrade
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          suppressHydrationWarning
        >
          <span suppressHydrationWarning>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </span>
        </button>

        <div className="relative">
          <button
            type="button"
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
            <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Notifications
                </p>
                {notifs.length > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-[var(--accent)] hover:underline"
                    onClick={() => persistRead(notifs.map((n) => n.id))}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifError ? (
                <p className="px-3 py-4 text-center text-sm text-muted">{notifError}</p>
              ) : notifs.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted">
                  No notifications yet.
                </p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={cn(
                      "flex w-full flex-col rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-hover)] hover:text-foreground",
                      readIds.includes(n.id) ? "text-subtle" : "text-foreground"
                    )}
                    onClick={() => {
                      persistRead(readIds.includes(n.id) ? readIds : [...readIds, n.id]);
                      setNotifOpen(false);
                      router.push(safeCueAiHref(n.href, session?.role));
                    }}
                  >
                    <span>{n.title}</span>
                    {n.body ? <span className="text-xs text-muted">{n.body}</span> : null}
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
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-[var(--surface-hover)]"
          >
            <Avatar name={displayName} size="sm" />
            <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline">
              {displayName}
            </span>
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]">
              {session ? (
                <>
                  <div className="border-b border-[var(--border)] px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Account</p>
                    <p className="truncate text-sm font-medium">{session.name}</p>
                    <p className="truncate text-xs text-subtle">{session.email}</p>
                    {session.role ? (
                      <p className="truncate text-xs text-muted">{session.role}</p>
                    ) : null}
                  </div>
                  <Link
                    href="/settings"
                    className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    <User className="h-3.5 w-3.5" />
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </Link>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
                    onClick={() => {
                      toggleTheme();
                      setProfileOpen(false);
                    }}
                  >
                    <Palette className="h-3.5 w-3.5" />
                    {theme === "dark" ? "Switch to light" : "Switch to dark"}
                  </button>
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Device & Security
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--cue-danger)] transition hover:bg-red-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href={withDesktopParam("/signup")}
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--surface-hover)]"
                    onClick={() => setProfileOpen(false)}
                  >
                    Create account
                  </Link>
                  <Link
                    href={withDesktopParam("/login")}
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

      {commandOpen &&
        createPortal(
          <div
            className={macDesktop ? "mac-spotlight" : "fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]"}
            onClick={() => setCommandOpen(false)}
          >
            <div
              className={
                macDesktop
                  ? "mac-spotlight-card"
                  : "w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] shadow-[var(--shadow-lg)]"
              }
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
                <Search className="h-4 w-4 text-subtle" />
                <input
                  ref={commandInputRef}
                  value={commandQuery}
                  onChange={(e) => setCommandQuery(e.target.value)}
                  placeholder="Search meetings, docs, answers…"
                  className={macDesktop ? "" : "h-12 flex-1 bg-transparent text-sm outline-none"}
                />
                <kbd className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-subtle">
                  Esc
                </kbd>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {filteredCommands.length === 0 && filteredMeetings.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted">No results found.</p>
                ) : (
                  <>
                    {filteredMeetings.map((meeting) => (
                      <button
                        key={meeting.id}
                        type="button"
                        className={macDesktop ? "mac-spotlight-row" : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-hover)]"}
                        onClick={() => {
                          setCommandOpen(false);
                          router.push(`/meetings/${meeting.id}/summary`);
                        }}
                      >
                        <FileText className="h-4 w-4 text-subtle" />
                        {meeting.title}
                      </button>
                    ))}
                    {filteredCommands.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.href}
                          type="button"
                          className={macDesktop ? "mac-spotlight-row" : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-hover)]"}
                          onClick={() => {
                            setCommandOpen(false);
                            router.push(item.href);
                          }}
                        >
                          <Icon className="h-4 w-4 text-subtle" />
                          {item.label}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
