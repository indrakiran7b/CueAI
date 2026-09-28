import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { testStoredCredential } from "@/lib/server/credential-resolver";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/settings/api-keys/:id/test
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const { id } = await ctx.params;

  const result = await testStoredCredential({
    id,
    userId: session.userId,
    workspaceId: session.workspaceId,
  });

  return NextResponse.json({
    ok: result.ok,
    message: result.message,
  });
}
