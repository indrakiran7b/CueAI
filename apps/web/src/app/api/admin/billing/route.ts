import { NextRequest, NextResponse } from "next/server";
import { requirePermission, jsonError } from "@/lib/server/api-auth";
import { listAdminBillingRows, getPublicBillingCatalogEnriched } from "@/lib/server/billing";
import { isStripeBillingConfigured } from "@/lib/server/billing-plans";

/**
 * GET /api/admin/billing
 * Admin subscription overview — never includes card numbers or secrets.
 */
export async function GET(req: NextRequest) {
  const { error } = await requirePermission("usage.read", req);
  if (error) return error;

  try {
    const rows = await listAdminBillingRows();
    const catalog = await getPublicBillingCatalogEnriched();
    return NextResponse.json({
      configured: isStripeBillingConfigured(),
      catalog,
      subscriptions: rows,
    });
  } catch (err) {
    console.error("[billing] admin.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to load billing data.", 503);
  }
}
