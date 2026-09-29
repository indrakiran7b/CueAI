import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { WebCompanionProvider } from "@/components/companion/web-companion-provider";
import { RequireAuth } from "@/components/auth/require-auth";
import { CueAiRouteGate } from "@/components/auth/cueai-route-gate";
import { MacDeviceGate } from "@/components/mac/mac-device-gate";
import { MacWorkspace } from "@/components/desktop/mac-workspace";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WebCompanionProvider>
      <RequireAuth>
        <CueAiRouteGate>
        <MacDeviceGate>
        <MacWorkspace>
          <Sidebar />
          <div className="mac-stage flex min-w-0 min-h-0 flex-1 flex-col">
            <Topbar />
            <main className="cue-scroll flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
        </MacWorkspace>
        </MacDeviceGate>
        </CueAiRouteGate>
      </RequireAuth>
    </WebCompanionProvider>
  );
}
