"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

function BillingSuccessInner() {
  const params = useSearchParams();
  const updated = params.get("updated") === "1";
  const [state, setState] = useState<"processing" | "active" | "pending">("processing");
  const [planName, setPlanName] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/subscription", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as {
        paymentState?: string;
        status?: string;
        planName?: string;
      };
      if (!res.ok) return;
      setPlanName(body.planName || null);
      if (
        body.paymentState === "active" ||
        body.status === "active" ||
        body.status === "trialing"
      ) {
        setState("active");
      } else if (updated) {
        setState("active");
      } else {
        setState("processing");
      }
    } catch {
      setState("pending");
    }
  }, [updated]);

  useEffect(() => {
    const t0 = window.setTimeout(() => void poll(), 0);
    const t1 = window.setTimeout(() => void poll(), 2500);
    const t2 = window.setTimeout(() => void poll(), 8000);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [poll]);

  return (
    <Card className="mx-auto max-w-lg space-y-4 p-6">
      <CardTitle className="flex items-center gap-2">
        {state === "active" ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
        )}
        {state === "active" ? "Subscription active" : "Payment received"}
      </CardTitle>
      <p className="text-sm text-muted">
        {state === "active"
          ? planName
            ? `Your ${planName} plan is confirmed.`
            : "Your subscription is confirmed."
          : "Confirming your subscription… We’re waiting for Stripe to verify payment. This usually takes a few seconds."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" href="/settings#billing">
          View billing
        </Button>
        <Button variant="secondary" href="/dashboard">
          Back to dashboard
        </Button>
        <Link href="/settings#billing" className="text-sm text-[var(--accent)] underline-offset-2 hover:underline self-center">
          Settings
        </Link>
      </div>
    </Card>
  );
}

export default function BillingSuccessPage() {
  return (
    <div className="mx-auto max-w-5xl py-4">
      <Suspense
        fallback={
          <Card className="mx-auto max-w-lg p-6 text-sm text-muted">Confirming payment…</Card>
        }
      >
        <BillingSuccessInner />
      </Suspense>
    </div>
  );
}
