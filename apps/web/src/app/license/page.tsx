import { Suspense } from "react";
import { LicenseActivationClient } from "@/components/desktop/license-activation-client";

export default function LicensePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted">
          Loading…
        </div>
      }
    >
      <LicenseActivationClient />
    </Suspense>
  );
}
