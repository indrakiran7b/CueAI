import { Suspense } from "react";
import { BillingPanel } from "@/components/billing/billing-panel";

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your CueAI subscription. Status is confirmed by the server after Stripe
          webhooks — returning from Checkout alone is not enough.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-xl border border-[var(--border)] p-6 text-sm text-muted">
            Loading billing…
          </div>
        }
      >
        <BillingPanel />
      </Suspense>
    </div>
  );
}
