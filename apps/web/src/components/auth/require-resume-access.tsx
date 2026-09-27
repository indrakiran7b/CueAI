"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AUTH_BYPASS } from "@/lib/auth";
import { canAccessResumeTailor } from "@/lib/app-access";
import { withDesktopParam } from "@/lib/desktop-query";
import { Button } from "@/components/ui/button";

/**
 * Resume Tailor is Admin + Manager only (web). Normal users are denied even via direct URL.
 */
export function RequireResumeAccess({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = canAccessResumeTailor(session?.role);

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

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Access denied</h1>
        <p className="text-sm text-muted">
          Resume Tailor is available to Admin and Manager accounts only. Your current role
          cannot open this product.
        </p>
        <Button variant="primary" href="/dashboard">
          Go to CueAI dashboard
        </Button>
        <Link href="/" className="text-sm text-[var(--accent)] underline-offset-2 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
