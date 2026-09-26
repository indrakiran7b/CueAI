import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import { isCheckoutPlanId } from "@/lib/billing-plans";
import { getStripe, stripePriceId } from "@/lib/server/stripe";
import { readStore } from "@/lib/server/db";
import { getSubscriptionForUser } from "@/lib/server/billing-db";

function appOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    req.nextUrl.origin
  );
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error || jsonError("Unauthorized", 401);

  const body = (await req.json().catch(() => null)) as { plan?: string } | null;
  const plan = String(body?.plan || "").trim();
  if (!isCheckoutPlanId(plan)) {
    return jsonError("Unsupported plan.", 400);
  }

  const stripe = getStripe();
  const price = stripePriceId(plan);
  if (!stripe || !price) {
    return jsonError("Payments are temporarily unavailable. Please try again later.", 503);
  }

  const store = await readStore();
  const user = store.users.find((item) => item.id === session.userId);
  const existing = await getSubscriptionForUser(session.userId);

  try {
    const origin = appOrigin(req);
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/settings?section=billing&checkout=success`,
      cancel_url: `${origin}/settings?section=billing&checkout=cancel`,
      client_reference_id: session.userId,
      customer: existing?.stripeCustomerId,
      customer_email: existing?.stripeCustomerId ? undefined : user?.email || session.email,
      metadata: { userId: session.userId, plan },
      subscription_data: {
        metadata: { userId: session.userId, plan },
      },
    });
    if (!checkout.url) {
      return jsonError("Payments are temporarily unavailable. Please try again later.", 503);
    }
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[billing] checkout.error", err instanceof Error ? err.message : err);
    return jsonError("Payments are temporarily unavailable. Please try again later.", 503);
  }
}
