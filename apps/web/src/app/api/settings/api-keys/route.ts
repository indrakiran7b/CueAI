import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import type { ApiCredentialCapability } from "@/lib/server/db";
import {
  createUserCredential,
  isByokProvider,
  listByokProviders,
  listUserCredentials,
  publicCredential,
} from "@/lib/server/credential-resolver";
import { ensureAiCatalog, publicModels } from "@/lib/server/ai-config";
import { readStore } from "@/lib/server/db";

const ALL_CAPS: ApiCredentialCapability[] = ["rag", "live_session", "general_ai"];

function parseCapabilities(raw: unknown): ApiCredentialCapability[] {
  if (!Array.isArray(raw)) return [...ALL_CAPS];
  const out = raw
    .map((v) => String(v))
    .filter((v): v is ApiCredentialCapability =>
      ALL_CAPS.includes(v as ApiCredentialCapability),
    );
  return out.length ? out : [...ALL_CAPS];
}

/**
 * GET /api/settings/api-keys
 * Lists the authenticated user's BYOK credentials (masked only).
 */
export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const store = await readStore();
  ensureAiCatalog(store.ai);
  const items = await listUserCredentials({
    userId: session.userId,
    workspaceId: session.workspaceId,
  });

  return NextResponse.json({
    items: items.map(publicCredential),
    providers: listByokProviders(),
    models: publicModels(store.ai).filter((m) => m.enabled && m.capability === "chat"),
  });
}

/**
 * POST /api/settings/api-keys
 * Create + verify a BYOK credential. Raw key is never returned.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as {
    provider?: string;
    model?: string;
    name?: string;
    apiKey?: string;
    endpoint?: string;
    organizationId?: string;
    capabilities?: unknown;
    isDefault?: boolean;
  } | null;

  const provider = String(body?.provider || "").trim().toLowerCase();
  const apiKey = String(body?.apiKey || "").trim();
  const model = String(body?.model || "").trim();
  const name = String(body?.name || "").trim();

  if (!isByokProvider(provider)) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Select a provider." } },
      { status: 400 },
    );
  }
  if (!model) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Select an LLM model." } },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "A key name is required." } },
      { status: 400 },
    );
  }
  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "A valid API key is required." } },
      { status: 400 },
    );
  }

  const result = await createUserCredential({
    userId: session.userId,
    workspaceId: session.workspaceId,
    provider,
    model,
    name,
    apiKey,
    endpoint: body?.endpoint,
    organizationId: body?.organizationId,
    capabilities: parseCapabilities(body?.capabilities),
    isDefault: body?.isDefault !== false,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.code, message: result.error } },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { item: publicCredential(result.credential) },
    { status: 201 },
  );
}
