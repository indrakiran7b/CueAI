"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { restrictedCueAiPath } from "@/lib/app-access";
import { isMacDesktopApp } from "@/lib/desktop";
import { withDesktopParam } from "@/lib/desktop-query";
import { isResumeProductPath, persistProductFromSearch, persistProductMode } from "@/lib/product-mode";

export function CueAiRouteGate({ children }: { children: ReactNode }) {
  const { session, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mac] = useState(() => isMacDesktopApp());

  useEffect(() => {
    persistProductFromSearch();
    persistProductMode(isResumeProductPath(pathname || "/") ? "resume" : "cueai");
  }, [pathname]);

  const blocked =
    status === "authenticated"
      ? restrictedCueAiPath(pathname || "/", session?.role, { macDesktop: mac })
      : null;

  useEffect(() => {
    if (status !== "authenticated" || !blocked) return;
    router.replace(withDesktopParam(blocked));
  }, [status, blocked, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Loading workspace…
      </div>
    );
  }

  if (status === "authenticated" && blocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
