"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Logo } from "@/components/ui/logo";
import { isResumeProductPath, persistProductMode, withProductParam } from "@/lib/product-mode";
import { withDesktopParam } from "@/lib/desktop-query";

const RESUME_NAV = [
  { href: "/resume-tailor#upload", label: "Upload Resume" },
  { href: "/resume-tailor#job", label: "Job Description" },
  { href: "/resume-tailor#analysis", label: "ATS Analysis" },
  { href: "/resume-tailor#skills", label: "Skills Match" },
  { href: "/resume-tailor#suggestions", label: "Suggestions" },
  { href: "/resume-tailor#results", label: "Results" },
];

export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isolated = isResumeProductPath(pathname);

  useEffect(() => {
    if (isolated) persistProductMode("resume");
  }, [isolated]);

  if (isolated) {
    return (
      <div className="mac-shell flex h-screen flex-col overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--border)] px-4">
          <Logo href="/" size="sm" />
          <p className="hidden text-sm font-semibold sm:block">Resume Tailor</p>
          <nav className="cue-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs sm:text-sm">
            {RESUME_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-lg px-2 py-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onClick={() => router.push(withDesktopParam(withProductParam("/settings?section=billing")))}
          >
            Upgrade
          </button>
        </header>
        <main className="cue-scroll flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div className="mac-stage flex min-w-0 min-h-0 flex-1 flex-col">
        <Topbar />
        <main className="cue-scroll flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </>
  );
}
