import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import {
  publicCredential,
  setDefaultCredential,
  getUserCredential,
} from "@/lib/server/credential-resolver";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/settings/api-keys/:id/default
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const { id } = await ctx.params;

  const ok = await setDefaultCredential({
    id,
    userId: session.userId,
    workspaceId: session.workspaceId,
  });
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const item = await getUserCredential({
    id,
    userId: session.userId,
    workspaceId: session.workspaceId,
  });
  return NextResponse.json({ ok: true, item: item ? publicCredential(item) : null });
}
