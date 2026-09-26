import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import { BillingUserError, createPortalSession } from "@/lib/server/billing";

/**
 * POST /api/billing/portal
 * Opens Stripe Customer Portal for plan changes, payment methods, invoices.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => ({}))) as { returnUrl?: string };

  try {
    const result = await createPortalSession({
      userId: session.userId,
      returnUrl: body.returnUrl,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BillingUserError) {
      return jsonError(err.message, err.status);
    }
    console.error("[billing] portal.error", err instanceof Error ? err.message : err);
    return jsonError("Billing service is temporarily unavailable.", 503);
  }
}
