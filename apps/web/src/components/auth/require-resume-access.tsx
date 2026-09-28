"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AUTH_BYPASS } from "@/lib/auth";
import { withDesktopParam } from "@/lib/desktop-query";

/**
 * Resume Tailor: any authenticated CueAI user (User, Manager, Admin).
 * Desktop Electron is blocked by DesktopAccessGuard on the outer layout.
 */
export function RequireResumeAccess({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || AUTH_BYPASS) return;
    if (!session) {
      const next = encodeURIComponent(pathname || "/resume-tailor");
      router.replace(withDesktopParam(`/login?next=${next}`));
    }
  }, [ready, session, router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Checking access…
      </div>
    );
  }

  if (!AUTH_BYPASS && !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting to sign in…
      </div>
    );
  }

  return <>{children}</>;
}
