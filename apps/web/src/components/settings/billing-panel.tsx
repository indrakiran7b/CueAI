"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDesktop } from "@/lib/desktop";
import type { BillingPlan, CheckoutPlanId } from "@/lib/billing-plans";

type SubscriptionResponse = {
  plan?: BillingPlan;
  status?: string;
  currentPeriodEnd?: string | null;
  error?: string;
};

const PAYMENTS_UNAVAILABLE = "Payments are temporarily unavailable. Please try again later.";

async function openCheckoutUrl(url: string) {
  const desktop = getDesktop();
  if (desktop?.openExternal) {
    await desktop.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function BillingPanel() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [plan, setPlan] = useState<BillingPlan>("free");
  const [status, setStatus] = useState("none");
  const [busyPlan, setBusyPlan] = useState<CheckoutPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function refreshSubscription() {
    const res = await fetch("/api/billing/subscription", { cache: "no-store", credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as SubscriptionResponse;
    if (!res.ok) {
      setError(data.error || "Unable to load subscription.");
      return;
    }
    setPlan(data.plan === "team" ? "team" : data.plan === "pro" ? "pro" : "free");
    setStatus(data.status || "none");
    setError(null);
  }

  useEffect(() => {
    void refreshSubscription();
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setInfo("Payment received. Refreshing your plan…");
      void refreshSubscription();
    }
    if (params.get("checkout") === "cancel") {
      setInfo("Checkout was cancelled. No charge was made.");
    }
  }, []);

  async function upgrade(next: CheckoutPlanId) {
    setBusyPlan(next);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || PAYMENTS_UNAVAILABLE);
        return;
      }
      await openCheckoutUrl(data.url);
      setInfo("Continue in the Stripe checkout window, then return here.");
    } catch {
      setError(PAYMENTS_UNAVAILABLE);
    } finally {
      setBusyPlan(null);
    }
  }

  const currentLabel = plan === "team" ? "Team" : plan === "pro" ? "Pro" : "Free";

  return (
    <Card className="space-y-5 p-6">
      <CardHeader>
        <div>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Stripe processes the payment. CueAI updates your plan from the webhook.</CardDescription>
        </div>
        <Badge variant={plan === "free" ? "default" : "info"}>{currentLabel}</Badge>
      </CardHeader>

      <div>
        <p className="text-sm text-muted">Current Plan</p>
        <p className="mt-1 text-2xl font-semibold">{currentLabel}</p>
        {status !== "none" && status !== "active" ? (
          <p className="mt-1 text-xs text-muted">Status: {status.replace(/_/g, " ")}</p>
        ) : null}
      </div>

      <div className="inline-flex rounded-xl border border-[var(--border)] p-1">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${interval === "month" ? "bg-[var(--surface-active)] text-foreground" : "text-muted"}`}
          onClick={() => setInterval("month")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${interval === "year" ? "bg-[var(--surface-active)] text-foreground" : "text-muted"}`}
          onClick={() => setInterval("year")}
        >
          Yearly
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] p-4">
          <p className="text-lg font-semibold">Pro</p>
          <p className="mt-1 text-sm text-muted">{interval === "month" ? "$5/month" : "$50/year"}</p>
          <Button
            className="mt-4 w-full"
            variant="primary"
            disabled={busyPlan !== null}
            onClick={() => void upgrade(interval === "month" ? "pro_monthly" : "pro_yearly")}
          >
            {busyPlan === (interval === "month" ? "pro_monthly" : "pro_yearly") ? "Opening…" : "Upgrade Plan"}
          </Button>
        </div>
        <div className="rounded-2xl border border-[var(--border)] p-4">
          <p className="text-lg font-semibold">Team</p>
          <p className="mt-1 text-sm text-muted">{interval === "month" ? "$10/month" : "$100/year"}</p>
          <Button
            className="mt-4 w-full"
            variant="primary"
            disabled={busyPlan !== null}
            onClick={() => void upgrade(interval === "month" ? "team_monthly" : "team_yearly")}
          >
            {busyPlan === (interval === "month" ? "team_monthly" : "team_yearly") ? "Opening…" : "Upgrade Plan"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--cue-danger)]">{error}</p> : null}
      {info ? <p className="text-sm text-muted">{info}</p> : null}
    </Card>
  );
}
