import { WebCompanionProvider } from "@/components/companion/web-companion-provider";
import { RequireAuth } from "@/components/auth/require-auth";
import { CueAiRouteGate } from "@/components/auth/cueai-route-gate";
import { MacDeviceGate } from "@/components/mac/mac-device-gate";
import { MacWorkspace } from "@/components/desktop/mac-workspace";
import { ProductShell } from "@/components/layout/product-shell";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WebCompanionProvider>
      <RequireAuth>
        <CueAiRouteGate>
        <MacDeviceGate>
        <MacWorkspace>
          <ProductShell>{children}</ProductShell>
        </MacWorkspace>
        </MacDeviceGate>
        </CueAiRouteGate>
      </RequireAuth>
    </WebCompanionProvider>
  );
}
