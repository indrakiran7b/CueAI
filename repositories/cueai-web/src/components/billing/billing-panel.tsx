"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PAYMENTS_UNAVAILABLE =
  "Payments are temporarily unavailable. Please try again later.";

type CatalogPlan = {
  id: string;
  name: string;
  description: string;
  interval: "month" | "year" | "none";
  cuePlan: "free" | "premium";
  entitlementLevel?: "free" | "pro" | "team";
  features: string[];
  highlighted?: boolean;
  displayAmountCents: number;
  currency: string;
  purchasable: boolean;
  stripePriceId?: string | null;
};

type BillingStatus = {
  configured: boolean;
  planId: string;
  planName: string;
  cuePlan: string;
  entitlementLevel?: string;
  status: string;
  paymentState: string;
  interval: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string | null;
  entitlements: Record<string, boolean>;
  catalog: {
    currency: string;
    trialDays: number;
    stripeConfigured: boolean;
    pricesConfigured?: boolean;
    plans: CatalogPlan[];
  };
};

function formatMoney(cents: number, currency = "usd") {
  if (!Number.isFinite(cents) || cents < 0) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusBadge(status: string, paymentState: string): {
  label: string;
  variant: "success" | "warning" | "danger" | "info" | "default";
} {
  if (paymentState === "processing") return { label: "Payment processing…", variant: "info" };
  if (status === "active") return { label: "Active", variant: "success" };
  if (status === "trialing") return { label: "Trialing", variant: "info" };
  if (status === "past_due" || status === "unpaid")
    return { label: "Payment requires attention", variant: "warning" };
  if (status === "canceled") return { label: "Canceled", variant: "default" };
  if (paymentState === "expired") return { label: "Expired", variant: "danger" };
  if (paymentState === "failed") return { label: "Payment failed", variant: "danger" };
  return { label: status === "none" ? "Free" : status, variant: "default" };
}

/**
 * Settings → Billing (and /billing, /pricing) plan cards.
 * CTA labels are NEVER derived from Stripe configuration state.
 * Missing Stripe config surfaces only as an error AFTER click.
 */
export function BillingPanel({
  compact = false,
  showCatalog = true,
}: {
  compact?: boolean;
  showCatalog?: boolean;
}) {
  const searchParams = useSearchParams();
  const checkoutFlag = searchParams.get("checkout");
  const checkoutBanner =
    checkoutFlag === "success"
      ? "Payment received. Confirming your subscription…"
      : checkoutFlag === "canceled" || checkoutFlag === "cancelled"
        ? "Checkout cancelled. Your plan was not changed."
        : null;

  const [data, setData] = useState<BillingStatus | null>(null);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/status", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as BillingStatus & { error?: string };
      if (!res.ok) throw new Error(body.error || "Unable to load billing status.");
      setData(body);
      if (body.interval === "year") setInterval("year");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load billing status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (checkoutFlag !== "success") return;
    const t = window.setTimeout(() => void load(), 2500);
    const t2 = window.setTimeout(() => void load(), 8000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [checkoutFlag, load]);

  const plans = useMemo(() => {
    const all = data?.catalog?.plans || [];
    const free = all.find((p) => p.id === "free");
    const paid = all.filter((p) => p.interval === interval);
    return [free, ...paid].filter(Boolean) as CatalogPlan[];
  }, [data, interval]);

  async function startCheckout(plan: CatalogPlan) {
    setBusy(plan.id);
    setError(null);
    // Never change the button label based on Stripe config — only show errors on click.
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Frontend sends CueAI plan id only — never arbitrary Stripe Price IDs.
        body: JSON.stringify({ planId: plan.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error || PAYMENTS_UNAVAILABLE);
      }
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : PAYMENTS_UNAVAILABLE);
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error || PAYMENTS_UNAVAILABLE);
      }
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : PAYMENTS_UNAVAILABLE);
      setBusy(null);
    }
  }

  async function cancelAtPeriodEnd() {
    if (!window.confirm("Cancel at the end of the current billing period?")) return;
    setBusy("cancel");
    setError(null);
    try {
      const res = await fetch("/api/billing/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: BillingStatus;
      };
      if (!res.ok) throw new Error(body.error || "Unable to cancel subscription.");
      if (body.status) setData((prev) => (prev ? { ...prev, ...body.status, catalog: prev.catalog } : prev));
      setMessage("Subscription will end at period close. You keep access until then.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel subscription.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading billing…
      </Card>
    );
  }

  const badge = statusBadge(data?.status || "none", data?.paymentState || "none");
  const currentCatalogPlan = (data?.catalog?.plans || []).find(
    (p) =>
      p.id === data?.planId ||
      (data?.cuePlan === "free" && p.id === "free") ||
      (p.name === data?.planName &&
        (p.interval === data?.interval || (data?.interval === "none" && p.id === "free"))),
  );
  const currentPriceLabel =
    data?.cuePlan === "free" || !currentCatalogPlan || currentCatalogPlan.id === "free"
      ? "$0"
      : currentCatalogPlan.displayAmountCents > 0
        ? `${formatMoney(currentCatalogPlan.displayAmountCents, currentCatalogPlan.currency)}${
            currentCatalogPlan.interval === "month"
              ? "/month"
              : currentCatalogPlan.interval === "year"
                ? "/year"
                : ""
          }`
        : null;

  return (
    <div className={cn("space-y-6", compact && "space-y-4")} data-billing-panel="v2-upgrade-plan">
      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--accent)]" />
              Current plan
            </CardTitle>
            <p className="mt-1 text-sm text-muted">
              {data?.planName || "Free"}
              {currentPriceLabel ? (
                <>
                  {" "}
                  · <span className="text-foreground">{currentPriceLabel}</span>
                </>
              ) : null}
              {" · "}
              {data?.interval === "year"
                ? "Yearly"
                : data?.interval === "month"
                  ? "Monthly"
                  : "No billing cycle"}
            </p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted">Status</p>
            <p className="mt-0.5 font-medium">{data?.status || "none"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Current period</p>
            <p className="mt-0.5 font-medium">
              {formatDate(data?.currentPeriodStart || null)} →{" "}
              {formatDate(data?.currentPeriodEnd || null)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Renewal / end</p>
            <p className="mt-0.5 font-medium">
              {data?.cancelAtPeriodEnd
                ? `Ends ${formatDate(data.currentPeriodEnd)}`
                : formatDate(data?.currentPeriodEnd || null)}
            </p>
          </div>
        </div>

        {(message || checkoutBanner) && (
          <p className="text-sm text-teal-300">{message || checkoutBanner}</p>
        )}
        {error && <p className="text-sm text-[#f87171]">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={Boolean(busy) || !data?.stripeCustomerId}
            onClick={() => void openPortal()}
          >
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </Button>
          {data?.cuePlan === "premium" && !data.cancelAtPeriodEnd && (
            <Button
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => void cancelAtPeriodEnd()}
            >
              {busy === "cancel" ? "Canceling…" : "Cancel at period end"}
            </Button>
          )}
          <Button variant="ghost" href="/settings#billing">
            View all plans
          </Button>
        </div>
      </Card>

      {showCatalog && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Choose your plan</h3>
              <p className="text-sm text-muted">USD · United States payment methods via Stripe</p>
            </div>
            <div className="inline-flex rounded-full border border-[var(--border)] p-1">
              <button
                type="button"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  interval === "month" ? "bg-[var(--surface-active)] text-foreground" : "text-muted",
                )}
                onClick={() => setInterval("month")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  interval === "year" ? "bg-[var(--surface-active)] text-foreground" : "text-muted",
                )}
                onClick={() => setInterval("year")}
              >
                Yearly
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent =
                data?.planId === plan.id ||
                (plan.id === "free" && data?.cuePlan === "free") ||
                (plan.name === data?.planName &&
                  plan.interval === data?.interval &&
                  data?.cuePlan === "premium");
              const priceLabel =
                plan.id === "free"
                  ? "$0"
                  : plan.displayAmountCents > 0
                    ? formatMoney(plan.displayAmountCents, plan.currency) || "—"
                    : "—";
              const period =
                plan.interval === "month" ? "/month" : plan.interval === "year" ? "/year" : "";

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col p-5 transition",
                    plan.highlighted && "ring-1 ring-[var(--accent)]/40",
                    !isCurrent && plan.id !== "free" && "hover:border-[var(--accent)]/40",
                  )}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-black">
                      <Sparkles className="h-3 w-3" /> Popular
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-semibold uppercase tracking-wide">
                        {plan.name}
                      </h4>
                      <p className="mt-1 text-xs text-muted">{plan.description}</p>
                    </div>
                    {isCurrent && <Badge variant="success">Current</Badge>}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight">{priceLabel}</span>
                    {priceLabel !== "—" && <span className="text-sm text-muted">{period}</span>}
                  </div>
                  <ul className="mt-4 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2 text-sm text-muted">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    {plan.id === "free" ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={isCurrent}
                        href="/dashboard"
                        aria-label={isCurrent ? "Current Free plan" : "Get started on Free"}
                      >
                        {isCurrent ? "Current plan" : "Get started"}
                      </Button>
                    ) : isCurrent ? (
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled
                        aria-label={`Current ${plan.name} plan`}
                      >
                        Current plan
                      </Button>
                    ) : (
                      <Button
                        variant={plan.highlighted ? "primary" : "secondary"}
                        className="w-full"
                        disabled={Boolean(busy)}
                        data-cta="upgrade-plan"
                        data-plan-id={plan.id}
                        onClick={() => void startCheckout(plan)}
                        aria-label={`Upgrade Plan — ${plan.name}`}
                      >
                        {busy === plan.id ? "Redirecting…" : "Upgrade Plan"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Card brands (Visa, Mastercard, Amex, Discover), Apple Pay, and ACH Direct Debit
            are collected by Stripe Checkout — CueAI never stores raw card data.{" "}
            <Link href="/settings#billing" className="text-[var(--accent)] underline-offset-2 hover:underline">
              Billing details
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
