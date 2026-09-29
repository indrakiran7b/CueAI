import { NextRequest, NextResponse } from "next/server";
import { BillingUserError, constructAndProcessWebhook } from "@/lib/server/billing";

export const runtime = "nodejs";

/**
 * POST /api/billing/webhook
 * Stripe → CueAI. Signature verified. Idempotent by event id.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = Buffer.from(await req.arrayBuffer());

  try {
    const result = await constructAndProcessWebhook(rawBody, signature);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    if (err instanceof BillingUserError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[billing] webhook.error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
