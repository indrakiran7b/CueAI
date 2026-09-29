import { NextResponse } from "next/server";
import { getPublicBillingCatalogEnriched } from "@/lib/server/billing";

/**
 * GET /api/billing/catalog
 * Public plan catalog (no secrets). Amounts from Stripe Prices when configured.
 */
export async function GET() {
  try {
    const catalog = await getPublicBillingCatalogEnriched();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("[billing] catalog.error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Unable to load billing catalog." },
      { status: 503 },
    );
  }
}
