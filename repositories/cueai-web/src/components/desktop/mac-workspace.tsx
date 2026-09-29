"use client";

import type { ReactNode } from "react";

/** Finder-style Mac workspace is applied via `html[data-desktop="mac"]` CSS. */
export function MacWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="mac-shell flex h-screen flex-col overflow-hidden bg-background">
      <div className="mac-workspace flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
