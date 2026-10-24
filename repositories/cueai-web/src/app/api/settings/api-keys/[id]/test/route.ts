import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import {
  getUserCredential,
  publicCredential,
  testStoredCredential,
} from "@/lib/server/credential-resolver";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/settings/api-keys/:id/test
 * Re-validates a stored key with a minimal provider request. Never returns the key.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const { id } = await ctx.params;
  const scope = { id, userId: session.userId, workspaceId: session.workspaceId };

  const result = await testStoredCredential(scope);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const fresh = await getUserCredential(scope);

  return NextResponse.json({
    ok: result.ok,
    code: result.code,
    message: result.message,
    item: fresh ? publicCredential(fresh) : null,
  });
}
