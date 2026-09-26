import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import { publicSubscription } from "@/lib/server/billing";

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error || jsonError("Unauthorized", 401);

  const store = await readStore();
  const user = store.users.find((item) => item.id === session.userId);
  if (!user) {
    return NextResponse.json({
      plan: "free",
      status: "none",
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
    });
  }

  return NextResponse.json(await publicSubscription(user));
}

export async function POST(req: NextRequest) {
  return GET(req);
}
