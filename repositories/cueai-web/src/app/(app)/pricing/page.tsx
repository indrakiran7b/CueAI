import { Suspense } from "react";
import { BillingPanel } from "@/components/billing/billing-panel";

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="text-center">
        <p className="text-sm font-medium tracking-wide text-[var(--accent)]">CueAI</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Choose your plan
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
          Start free. Upgrade when meeting insights become indispensable. Prices come from
          your workspace billing configuration — not hardcoded.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-xl border border-[var(--border)] p-6 text-center text-sm text-muted">
            Loading plans…
          </div>
        }
      >
        <BillingPanel showCatalog />
      </Suspense>
    </div>
  );
}
