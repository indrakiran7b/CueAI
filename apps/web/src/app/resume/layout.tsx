"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { useAuth } from "@/components/providers/auth-provider";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const RESUME_NAV = [
  { href: "#upload", label: "Upload Resume" },
  { href: "#job-description", label: "Job Description" },
  { href: "#ats", label: "ATS Analysis" },
  { href: "#skills", label: "Skills Match" },
  { href: "#suggestions", label: "Suggestions" },
  { href: "#results", label: "Results" },
] as const;

/**
 * Resume Tailor product shell — isolated from CueAI sidebar / Admin chrome.
 * Shared session/auth is fine; UI must stay Resume Tailor only.
 */
export default function ResumeProductLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <ResumeShell>{children}</ResumeShell>
    </RequireAuth>
  );
}

function ResumeShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[var(--border)]">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" href="/" />
            <span className="hidden h-4 w-px bg-[var(--border)] sm:block" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">Resume Tailor</span>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            {session?.email ? (
              <span className="hidden max-w-[12rem] truncate text-xs text-muted sm:inline">
                {session.email}
              </span>
            ) : null}
            <Link href="/" className="text-muted transition hover:text-foreground">
              Home
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="text-muted transition hover:text-foreground"
            >
              Log out
            </button>
          </nav>
        </div>
        <nav
          className="cue-scroll flex gap-1 overflow-x-auto px-4 pb-3 sm:px-6"
          aria-label="Resume Tailor sections"
        >
          {RESUME_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-muted",
                "transition hover:border-[var(--border-strong)] hover:text-foreground",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="cue-scroll mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
