import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { WebCompanionProvider } from "@/components/companion/web-companion-provider";
import { RequireAuth } from "@/components/auth/require-auth";
import { CueAiRouteGate } from "@/components/auth/cueai-route-gate";
import { MacWorkspace } from "@/components/desktop/mac-workspace";
import { DesktopHandoffRescue } from "@/components/auth/desktop-handoff-rescue";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WebCompanionProvider>
      <RequireAuth>
        <DesktopHandoffRescue />
        <CueAiRouteGate>
        <MacWorkspace>
          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>
          <div className="mac-stage flex min-w-0 min-h-0 flex-1 flex-col">
            <Topbar />
            <main className="cue-scroll cue-main-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
              {children}
            </main>
          </div>
        </MacWorkspace>
        </CueAiRouteGate>
      </RequireAuth>
    </WebCompanionProvider>
  );
}
