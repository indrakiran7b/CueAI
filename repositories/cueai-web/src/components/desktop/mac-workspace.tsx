"use client";

import type { ReactNode } from "react";

/** Finder-style Mac workspace is applied via `html[data-desktop="mac"]` CSS. */
export function MacWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="mac-shell flex h-screen w-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="mac-workspace flex min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
