"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

type BillingSummary = {
  cuePlan?: string;
  entitlementLevel?: string;
  planName?: string;
};

type PlanLevel = "free" | "pro" | "team";

function levelFromSession(plan?: string | null, billingPlanId?: string | null): PlanLevel {
  const id = String(billingPlanId || "").toLowerCase();
  if (id.startsWith("team")) return "team";
  if (plan === "premium" || id.startsWith("pro")) return "pro";
  return "free";
}

/**
 * Header Upgrade / Manage Plan — opens Settings → Billing.
 */
export function UpgradeButton({ className }: { className?: string }) {
  const { session } = useAuth();
  const fallback = levelFromSession(session?.plan, session?.billingPlanId);
  const [remote, setRemote] = useState<PlanLevel | null>(null);

  useEffect(() => {
    if (!session?.userId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch("/api/billing/subscription", {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) return null;
          return res.json() as Promise<BillingSummary>;
        })
        .then((data) => {
          if (cancelled || !data) return;
          const raw = String(data.entitlementLevel || data.planName || "").toLowerCase();
          if (raw.includes("team") || data.entitlementLevel === "team") {
            setRemote("team");
          } else if (
            data.cuePlan === "premium" ||
            data.entitlementLevel === "pro" ||
            raw.includes("pro")
          ) {
            setRemote("pro");
          } else {
            setRemote("free");
          }
        })
        .catch(() => {
          /* keep session fallback */
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session?.userId]);

  const effective = remote ?? fallback;
  const isPaid = effective === "pro" || effective === "team";
  const label = isPaid ? "Manage Plan" : "Upgrade";

  return (
    <Link
      href="/settings#billing"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-muted)] px-2.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/15 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 sm:px-3",
        className,
      )}
      aria-label={isPaid ? "Manage your CueAI plan" : "Upgrade your CueAI plan"}
      title={label}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{isPaid ? "Plan" : "Upgrade"}</span>
    </Link>
  );
}
