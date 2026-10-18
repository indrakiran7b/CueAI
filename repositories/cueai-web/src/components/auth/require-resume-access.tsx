"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AUTH_BYPASS } from "@/lib/auth";
import { canAccessResumeTailor } from "@/lib/roles";
import { persistProductMode } from "@/lib/product-mode";

export function RequireResumeAccess({ children }: { children: ReactNode }) {
  const { session, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    persistProductMode("resume");
  }, []);

  useEffect(() => {
    if (status === "loading" || AUTH_BYPASS) return;
    if (status === "unauthenticated") {
      router.replace(`/resume-tailor/login?product=resume&next=${encodeURIComponent(pathname || "/resume-tailor")}`);
      return;
    }
    if (!canAccessResumeTailor(session?.role)) {
      router.replace("/resume-tailor/denied");
    }
  }, [status, session, router, pathname]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Checking Resume Tailor access…
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
