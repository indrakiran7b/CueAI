"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AUTH_BYPASS } from "@/lib/auth";
import { withDesktopParam } from "@/lib/desktop-query";
import { isResumeProductPath } from "@/lib/product-mode";

/** Require a local/OAuth session for app routes unless auth bypass is enabled. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const resumePath = isResumeProductPath(pathname);

  const needsOnboarding = Boolean(session) && !session?.onboardingCompleted && !resumePath;

  useEffect(() => {
    if (status === "loading" || AUTH_BYPASS) return;
    const next = encodeURIComponent(pathname || "/dashboard");
    if (status === "unauthenticated") {
      router.replace(
        withDesktopParam(resumePath ? `/resume-tailor/login?product=resume&next=${next}` : `/login?next=${next}`),
      );
      return;
    }
    if (needsOnboarding) {
      router.replace(withDesktopParam(`/onboarding?next=${next}`));
    }
  }, [status, needsOnboarding, router, pathname, resumePath]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Loading workspace…
      </div>
    );
  }

  if (!AUTH_BYPASS && status === "unauthenticated") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting to sign in…
      </div>
    );
  }

  if (!AUTH_BYPASS && needsOnboarding) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Finishing your setup…
      </div>
    );
  }

  return <>{children}</>;
}
