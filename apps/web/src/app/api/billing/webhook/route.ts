import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/server/stripe";
import { markBillingEventProcessed } from "@/lib/server/billing-db";
import { applySubscriptionToUser, checkoutPlanFromPriceId, planFromCheckoutId } from "@/lib/server/billing";
import { isCheckoutPlanId } from "@/lib/billing-plans";
import type { BillingPlan } from "@/lib/billing-plans";
import type { StoredSubscription } from "@/lib/server/billing-db";

export const runtime = "nodejs";

function metaUserId(metadata?: Stripe.Metadata | null, fallback?: string | null) {
  return metadata?.userId?.trim() || fallback?.trim() || "";
}

function statusFromStripe(status: string | null | undefined): StoredSubscription["status"] {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  if (status === "unpaid") return "unpaid";
  if (status === "incomplete") return "incomplete";
  return "none";
}

function firstPriceId(sub: Stripe.Subscription) {
  const price = sub.items.data[0]?.price;
  return typeof price === "string" ? price : price?.id;
}

function periodEnd(sub: Stripe.Subscription) {
  const value = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  return typeof value === "number" ? new Date(value * 1000).toISOString() : undefined;
}

async function applyStripeSubscription(sub: Stripe.Subscription, fallbackUserId?: string) {
  const userId = metaUserId(sub.metadata, fallbackUserId);
  if (!userId) return;
  const priceId = firstPriceId(sub);
  const fromPrice = checkoutPlanFromPriceId(priceId);
  const fromMeta = isCheckoutPlanId(String(sub.metadata?.plan || "")) ? sub.metadata.plan : null;
  const checkoutPlan = fromPrice || (fromMeta && isCheckoutPlanId(fromMeta) ? fromMeta : null);
  const plan: BillingPlan = checkoutPlan ? planFromCheckoutId(checkoutPlan) : "free";
  const stripeStatus = statusFromStripe(sub.status);
  await applySubscriptionToUser({
    userId,
    plan: stripeStatus === "active" ? plan : "free",
    status: stripeStatus,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodEnd: periodEnd(sub),
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const first = await markBillingEventProcessed(event.id);
  if (!first) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = metaUserId(session.metadata, session.client_reference_id);
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await applyStripeSubscription(await stripe.subscriptions.retrieve(subId), userId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applyStripeSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = (invoice as Stripe.Invoice & { subscription?: string | { id: string } | null })
          .subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          await applyStripeSubscription(
            await stripe.subscriptions.retrieve(subId),
            metaUserId(invoice.metadata),
          );
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[billing] webhook.error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
