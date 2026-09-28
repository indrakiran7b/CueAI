import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import type { ApiCredentialCapability } from "@/lib/server/db";
import {
  deleteUserCredential,
  publicCredential,
  updateUserCredential,
} from "@/lib/server/credential-resolver";

type Ctx = { params: Promise<{ id: string }> };

const ALL_CAPS: ApiCredentialCapability[] = ["rag", "live_session", "general_ai"];

/**
 * PATCH /api/settings/api-keys/:id
 * Update name / model / rotate key. Blank apiKey keeps existing secret.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    model?: string;
    apiKey?: string;
    endpoint?: string;
    organizationId?: string;
    capabilities?: unknown;
    isDefault?: boolean;
  } | null;

  if (body?.name !== undefined && !String(body.name || "").trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "A key name is required." } },
      { status: 400 },
    );
  }
  if (body?.model !== undefined && !String(body.model || "").trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Select an LLM model." } },
      { status: 400 },
    );
  }

  const caps = Array.isArray(body?.capabilities)
    ? body!.capabilities
        .map((v) => String(v))
        .filter((v): v is ApiCredentialCapability =>
          ALL_CAPS.includes(v as ApiCredentialCapability),
        )
    : undefined;

  const result = await updateUserCredential({
    id,
    userId: session.userId,
    workspaceId: session.workspaceId,
    name: body?.name,
    model: body?.model,
    apiKey: body?.apiKey?.trim() || undefined,
    endpoint: body?.endpoint,
    organizationId: body?.organizationId,
    capabilities: caps,
    isDefault: body?.isDefault,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.code, message: result.error } },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json({ item: publicCredential(result.credential) });
}

/**
 * DELETE /api/settings/api-keys/:id
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const { id } = await ctx.params;

  const ok = await deleteUserCredential({
    id,
    userId: session.userId,
    workspaceId: session.workspaceId,
  });
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
