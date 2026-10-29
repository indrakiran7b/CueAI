"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

type WorkspaceRow = {
  id: string;
  name: string;
  current?: boolean;
};

type WorkspaceSwitcherProps = {
  variant?: "sidebar" | "toolbar";
  className?: string;
  onOpenChange?: (open: boolean) => void;
};

export function WorkspaceSwitcher({
  variant = "sidebar",
  className,
  onOpenChange,
}: WorkspaceSwitcherProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        setError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaces([]);
          setError("Unable to load workspaces.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  const label =
    workspaces.find((row) => row.current)?.name || session?.workspace?.trim() || "Your workspace";

  function setMenuOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
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
        setError(data.error || "Unable to switch workspace.");
        return;
      }
      setWorkspaces((rows) => rows.map((row) => ({ ...row, current: row.id === id })));
      setMenuOpen(false);
      router.refresh();
    } catch {
      setError("Unable to switch workspace.");
    }
  }

  const triggerClass =
    variant === "sidebar"
      ? "cue-ws-trigger cue-ws-trigger--sidebar"
      : "inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-1.5 text-sm transition hover:border-[var(--border-strong)]";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setMenuOpen(!open)}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close workspace menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className={cn(
              "absolute z-50 w-full min-w-[14rem] rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow-lg)]",
              variant === "sidebar" ? "left-0 top-[calc(100%+0.35rem)]" : "left-0 top-11 w-64"
            )}
          >
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Workspace
            </p>
            {error && <p className="px-3 py-2 text-sm text-[var(--cue-danger)]">{error}</p>}
            {workspaces.length === 0 && !error ? (
              <p className="px-3 py-3 text-sm text-muted">No workspace yet.</p>
            ) : (
              workspaces.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-[var(--surface-hover)]"
                  onClick={() => void selectWorkspace(row.id)}
                >
                  {row.current ? <Check className="h-3.5 w-3.5 text-foreground" /> : <span className="w-3.5" />}
                  {row.name}
                </button>
              ))
            )}
            <Link
              href="/settings"
              className="mt-1 block rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
              onClick={() => setMenuOpen(false)}
            >
              Workspace settings
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
