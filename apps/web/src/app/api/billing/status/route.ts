import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import {
  BillingUserError,
  cancelSubscriptionAtPeriodEnd,
  changeSubscriptionPlan,
  getBillingStatusForUser,
  getPublicBillingCatalogEnriched,
} from "@/lib/server/billing";

/**
 * GET /api/billing/status
 * Returns verified backend subscription state (never trust Checkout return params).
 */
export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  try {
    const status = await getBillingStatusForUser(session.userId);
    const catalog = await getPublicBillingCatalogEnriched();
    return NextResponse.json({
      ...status,
      catalog,
    });
  } catch (err) {
    console.error("[billing] status.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to load billing status.", 503);
  }
}

/**
 * POST /api/billing/status
 * Body actions: change_plan | cancel
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    planId?: string;
  } | null;

  const action = String(body?.action || "").trim();

  try {
    if (action === "change_plan") {
      const planId = String(body?.planId || "").trim();
      if (!planId) return jsonError("planId is required.", 400);
      const result = await changeSubscriptionPlan({
        userId: session.userId,
        planId,
      });
      const status = await getBillingStatusForUser(session.userId);
      return NextResponse.json({ ...result, status });
    }
    if (action === "cancel") {
      const result = await cancelSubscriptionAtPeriodEnd({ userId: session.userId });
      const status = await getBillingStatusForUser(session.userId);
      return NextResponse.json({ ...result, status });
    }
    return jsonError("Unknown action.", 400);
  } catch (err) {
    if (err instanceof BillingUserError) {
      return jsonError(err.message, err.status);
    }
    console.error("[billing] status.action.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to update subscription.", 503);
  }
}
