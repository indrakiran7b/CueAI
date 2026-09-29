"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AUTH_BYPASS } from "@/lib/auth";
import { canAccessResumeTailor } from "@/lib/roles";
import { isDesktopApp } from "@/lib/desktop";
import { persistProductMode } from "@/lib/product-mode";

export function RequireResumeAccess({ children }: { children: ReactNode }) {
  const { session, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const inDesktopApp = isDesktopApp();

  useEffect(() => {
    persistProductMode("resume");
  }, []);

  useEffect(() => {
    if (status === "loading" || AUTH_BYPASS) return;
    if (inDesktopApp) {
      router.replace("/dashboard");
      return;
    }
    if (status === "unauthenticated") {
      router.replace(`/resume-tailor/login?product=resume&next=${encodeURIComponent(pathname || "/resume-tailor")}`);
      return;
    }
    if (!canAccessResumeTailor(session?.role)) {
      router.replace("/resume-tailor/denied");
    }
  }, [status, session, router, pathname, inDesktopApp]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Checking Resume Tailor access…
      </div>
    );
  }

  if (inDesktopApp) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Resume Tailor is available on the web only.
      </div>
    );
  }

  if (!AUTH_BYPASS && !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting to Resume Tailor sign-in…
      </div>
    );
  }

  if (!AUTH_BYPASS && !canAccessResumeTailor(session?.role)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
