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
  Settings,
  Check,
  Shield,
} from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { canAccessAdmin } from "@/lib/roles";
import { useEffect, useRef, useState } from "react";
import { toggleCompanionOverlay } from "@/lib/desktop";
import Link from "next/link";
import { useRouter } from "next/navigation";

const USER_COMMAND_LINKS = [
  { label: "Start live meeting", href: "/meetings/live", icon: Video },
  { label: "Meetings", href: "/meetings", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];

type NotifItem = { id: string; text: string; href: string };

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const { session, logout } = useAuth();
  const router = useRouter();
  const admin = canAccessAdmin(session?.role);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [notifs] = useState<NotifItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [desktopReady, setDesktopReady] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const menuRootRef = useRef<HTMLElement | null>(null);

  function closeMenus() {
    setNotifOpen(false);
    setProfileOpen(false);
    setWorkspaceOpen(false);
  }

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
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    const t = window.setTimeout(() => commandInputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [commandOpen]);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (!menuRootRef.current) return;
      if (!menuRootRef.current.contains(e.target as Node)) closeMenus();
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [notifOpen, profileOpen, workspaceOpen]);

  const displayName = session?.name || "Guest";
  const workspace = session?.workspace || "CueAI";
  const initial = displayName.trim().charAt(0).toUpperCase() || "C";
  const unread = notifs.filter((n) => !readIds.includes(n.id)).length;

  const commandLinks = [
    ...USER_COMMAND_LINKS,
    ...(admin ? [{ label: "Admin Portal", href: "/admin", icon: Shield }] : []),
  ];
  const filteredCommands = commandLinks.filter((c) =>
    c.label.toLowerCase().includes(commandQuery.trim().toLowerCase()),
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
    router.push("/meetings/live");
  }

  return (
    <header
      ref={menuRootRef}
      className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)]/80 px-4 backdrop-blur-xl sm:px-6"
    >
      <div className="relative hidden md:block">
        <button
          type="button"
          onClick={() => {
            setWorkspaceOpen((o) => !o);
            setNotifOpen(false);
            setProfileOpen(false);
          }}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm transition hover:bg-[var(--surface-hover)]"
        >
          <span className="max-w-[140px] truncate font-medium">{workspace}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => {
            setCommandOpen(true);
            setCommandQuery("");
          }}
        >
          <Command className="h-3.5 w-3.5" />
          <span className="text-xs text-muted">Ctrl K</span>
        </Button>
        {desktopReady && (
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCompanion()}>
            Companion
          </Button>
        )}
        <Button type="button" variant="gradient" size="sm" onClick={handleStartMeeting}>
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Live</span>
        </Button>
        <button
          type="button"
          aria-label="Toggle theme"
          onClick={toggleTheme}
          className="rounded-lg p-2 text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => {
              setNotifOpen((o) => !o);
              setProfileOpen(false);
              setWorkspaceOpen(false);
            }}
            className="relative rounded-lg p-2 text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-teal-400" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] p-2 shadow-xl">
              {notifs.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted">No notifications</p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                    onClick={() => {
                      setReadIds((ids) => (ids.includes(n.id) ? ids : [...ids, n.id]));
                      router.push(n.href);
                      setNotifOpen(false);
                    }}
                  >
                    {!readIds.includes(n.id) ? (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                    ) : (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                    )}
                    <span>{n.text}</span>
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
            className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-[var(--surface-hover)]"
          >
            <Avatar name={displayName || initial || "User"} size="sm" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] p-2 shadow-xl">
              <div className="border-b border-[var(--border)] px-3 py-2">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted">{session?.email}</p>
              </div>
              <Link
                href="/settings"
                className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-[var(--surface-hover)]"
                onClick={() => setProfileOpen(false)}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              {admin && (
                <Link
                  href="/admin"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-[var(--surface-hover)]"
                  onClick={() => setProfileOpen(false)}
                >
                  <Shield className="h-4 w-4" />
                  Admin Portal
                </Link>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                onClick={() => void handleLogout()}
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {commandOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 px-4 pt-[15vh]">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
              <Search className="h-4 w-4 text-muted" />
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Jump to…"
                className="h-12 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted">No matches</p>
              ) : (
                filteredCommands.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-hover)]"
                      onClick={() => {
                        setCommandOpen(false);
                        router.push(item.href);
                      }}
                    >
                      <Icon className="h-4 w-4 text-muted" />
                      {item.label}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close command palette"
            className="absolute inset-0 -z-10"
            onClick={() => setCommandOpen(false)}
          />
        </div>
      )}
    </header>
  );
}
