"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isDesktopApp } from "@/lib/desktop";
import { isDesktopBlockedPath } from "@/lib/desktop-access";

/**
 * On Electron, redirect leftover web-only routes.
 * Resume Tailor, Admin Portal, Translation, and Screen Context are not blocked here.
 * No-op in the browser so the web app is unchanged.
 */
export function DesktopAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    if (!isDesktopApp()) return;
    if (isDesktopBlockedPath(pathname)) {
      router.replace("/dashboard");
    }
  }, [pathname, router]);

  if (typeof window !== "undefined" && isDesktopApp() && isDesktopBlockedPath(pathname)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
