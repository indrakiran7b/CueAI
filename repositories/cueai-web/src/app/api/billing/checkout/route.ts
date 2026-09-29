import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import {
  BillingUserError,
  createCheckoutSession,
} from "@/lib/server/billing";

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session (subscription mode).
 * Clients should send planId (e.g. pro_monthly / PRO_MONTHLY).
 * Stripe Price IDs are resolved server-side from env — never trust client Price IDs.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as {
    planId?: string;
    plan_id?: string;
    plan?: string;
    successUrl?: string;
    cancelUrl?: string;
  } | null;

  const planId = String(body?.planId || body?.plan_id || body?.plan || "").trim();
  if (!planId) {
    return jsonError("planId is required.", 400);
  }

  try {
    const result = await createCheckoutSession({
      userId: session.userId,
      planId,
      successUrl: body?.successUrl,
      cancelUrl: body?.cancelUrl,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BillingUserError) {
      return jsonError(err.message, err.status);
    }
    console.error("[billing] checkout.error", err instanceof Error ? err.message : err);
    return jsonError(
      "Payments are temporarily unavailable. Please try again later.",
      503,
    );
  }
}
