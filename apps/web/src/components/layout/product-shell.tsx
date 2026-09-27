"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

/** CueAI chrome only. Resume Tailor uses its own isolated shell. */
export function ProductShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="mac-stage flex min-w-0 min-h-0 flex-1 flex-col">
        <Topbar />
        <main className="cue-scroll flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </>
  );
}
