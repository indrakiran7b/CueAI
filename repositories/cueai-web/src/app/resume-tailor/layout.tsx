"use client";

import type { ReactNode } from "react";
import { DesktopAccessGuard } from "@/components/desktop/desktop-access-guard";

/** Outer Resume Tailor segment — blocks Electron; auth applied only under (product). */
export default function ResumeTailorRootLayout({ children }: { children: ReactNode }) {
  return <DesktopAccessGuard>{children}</DesktopAccessGuard>;
}
