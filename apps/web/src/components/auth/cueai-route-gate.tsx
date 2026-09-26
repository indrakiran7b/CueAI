"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { restrictedCueAiPath } from "@/lib/app-access";
import { isMacDesktopApp } from "@/lib/desktop";
import { withDesktopParam } from "@/lib/desktop-query";
import {
  getProductMode,
  isResumeProductPath,
  persistProductFromSearch,
  persistProductMode,
} from "@/lib/product-mode";

export function CueAiRouteGate({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mac] = useState(() => isMacDesktopApp());

  useEffect(() => {
    persistProductFromSearch();
    if (isResumeProductPath(pathname || "/")) persistProductMode("resume");
  }, [pathname]);

  const resumeProduct = isResumeProductPath(pathname || "/") || getProductMode() === "resume";
  const blocked = restrictedCueAiPath(pathname || "/", session?.role, {
    macDesktop: mac,
    resumeProduct,
  });

  useEffect(() => {
    if (!ready || !blocked) return;
    router.replace(withDesktopParam(blocked));
  }, [ready, blocked, router]);

  if (ready && blocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
