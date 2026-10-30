import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { getProviderStatus } from "@/lib/server/ai-provider-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/ai-providers
 * Read-only, sanitized provider/model routing for the signed-in user. No keys or key fragments.
 */
export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  try {
    const report = await getProviderStatus({ userId: session.userId, workspaceId: session.workspaceId });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load AI provider status." }, { status: 500 });
  }
}
