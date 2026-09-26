import Stripe from "stripe";
import {
  STRIPE_PRICE_ENV,
  type CheckoutPlanId,
} from "@/lib/billing-plans";

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripe) {
    stripe = new Stripe(key);
  }
  return stripe;
}

export function stripePriceId(plan: CheckoutPlanId): string | null {
  const value = process.env[STRIPE_PRICE_ENV[plan]]?.trim();
  return value || null;
}

export function stripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
}
