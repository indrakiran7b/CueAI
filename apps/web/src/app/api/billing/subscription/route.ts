import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import { getBillingStatusForUser } from "@/lib/server/billing";
import { getPublicBillingCatalogEnriched } from "@/lib/server/billing";

/**
 * GET /api/billing/subscription
 * Verified backend subscription state (alias of billing status without catalog mutation APIs).
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
    console.error("[billing] subscription.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to load subscription.", 503);
  }
}
