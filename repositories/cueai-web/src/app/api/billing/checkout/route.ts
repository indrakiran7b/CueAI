import { randomUUID } from "node:crypto";
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
 * Stripe Price IDs and success/cancel URLs are resolved server-side.
 */
export async function POST(req: NextRequest) {
  const requestId = randomUUID().slice(0, 8);
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as {
    planId?: string;
    plan_id?: string;
    plan?: string;
  } | null;

  const planId = String(body?.planId || body?.plan_id || body?.plan || "").trim();
  if (!planId) {
    return jsonError("planId is required.", 400);
  }

  try {
    const result = await createCheckoutSession({
      userId: session.userId,
      planId,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (err) {
    const category =
      err instanceof BillingUserError
        ? err.status === 503
          ? "config_or_provider"
          : "request"
        : "unexpected";
    console.error("[billing] checkout.error", {
      requestId,
      category,
      message: err instanceof Error ? err.message : "unknown",
    });
    if (err instanceof BillingUserError) {
      return NextResponse.json({ error: err.message, requestId }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please try again later.", requestId },
      { status: 503 },
    );
  }
}
