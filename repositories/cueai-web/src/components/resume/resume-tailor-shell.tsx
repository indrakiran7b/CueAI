"use client";

import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";

export function ResumeTailorShell({ children }: { children: ReactNode }) {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--border)] px-4">
        <Logo href="/" size="sm" />
        <p className="text-sm font-semibold">Resume Tailor</p>
        <span className="text-xs text-muted">Web only</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void logout()}
        >
          Sign out
        </Button>
      </header>
      <main className="cue-scroll flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
