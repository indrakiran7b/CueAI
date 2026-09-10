import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/server/api-auth";
import { appendAudit, updateStore, type DbAiModel, type DbAiProvider } from "@/lib/server/db";
import {
  DEFAULT_ENDPOINTS,
  ensureAiCatalog,
  publicAiSummary,
} from "@/lib/server/ai-config";
import { encryptSecret } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const { error } = await requirePermission("ai.read", req);
  if (error) return error;
  const { readStore } = await import("@/lib/server/db");
  const store = await readStore();
  return NextResponse.json(publicAiSummary(store.ai));
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requirePermission("ai.write", req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as
    | {
        // Provider ops
        provider?: Partial<DbAiProvider> & { id?: string; apiKey?: string; clearApiKey?: boolean };
        // Model ops
        model?: Partial<DbAiModel> & { id?: string };
        setDefaultModelId?: string;
        // Legacy flat fields still accepted
        defaultModel?: string;
        enabledModels?: string[];
      }
    | null;

  const store = await updateStore(async (s) => {
    ensureAiCatalog(s.ai);
    const now = new Date().toISOString();

    if (body?.provider) {
      const p = body.provider;
      if (p.id) {
        const existing = s.ai.providers!.find((x) => x.id === p.id);
        if (!existing) throw new Error("PROVIDER_NOT_FOUND");
        if (typeof p.name === "string") existing.name = p.name.trim() || existing.name;
        if (typeof p.enabled === "boolean") existing.enabled = p.enabled;
        if (typeof p.endpoint === "string") existing.endpoint = p.endpoint.trim();
        if (p.clearApiKey) existing.apiKeyEnc = "";
        if (typeof p.apiKey === "string" && p.apiKey.trim()) {
          existing.apiKeyEnc = encryptSecret(p.apiKey.trim());
        }
        existing.updatedAt = now;
        existing.updatedBy = session.userId;
      } else if (p.type) {
        const id = `prov_${p.type}_${randomUUID().slice(0, 6)}`;
        s.ai.providers!.push({
          id,
          name: p.name?.trim() || p.type,
          type: p.type,
          enabled: p.enabled !== false,
          endpoint: p.endpoint?.trim() || DEFAULT_ENDPOINTS[p.type] || "",
          apiKeyEnc: p.apiKey?.trim() ? encryptSecret(p.apiKey.trim()) : "",
          updatedAt: now,
          updatedBy: session.userId,
        });
      }
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "ai.provider_changed",
        resourceType: "ai_provider",
        resourceId: p.id || p.type || undefined,
        metadata: { keyUpdated: Boolean(p.apiKey) || Boolean(p.clearApiKey) },
      });
    }

    if (body?.model) {
      const m = body.model;
      if (m.id) {
        const existing = s.ai.models!.find((x) => x.id === m.id);
        if (!existing) throw new Error("MODEL_NOT_FOUND");
        if (typeof m.name === "string") existing.name = m.name.trim() || existing.name;
        if (typeof m.enabled === "boolean") existing.enabled = m.enabled;
        if (typeof m.providerId === "string") {
          if (!s.ai.providers!.some((p) => p.id === m.providerId)) throw new Error("INVALID_PROVIDER");
          existing.providerId = m.providerId;
        }
        if (m.capability) existing.capability = m.capability;
        if (typeof m.contextWindow === "number") existing.contextWindow = m.contextWindow;
        existing.updatedAt = now;
      } else if (m.name && m.providerId) {
        if (!s.ai.providers!.some((p) => p.id === m.providerId)) throw new Error("INVALID_PROVIDER");
        s.ai.models!.push({
          id: `mdl_${randomUUID().slice(0, 8)}`,
          name: m.name.trim(),
          providerId: m.providerId,
          capability: m.capability || "chat",
          enabled: m.enabled !== false,
          isDefault: false,
          contextWindow: m.contextWindow,
          updatedAt: now,
        });
      }
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "ai.model_changed",
        resourceType: "ai_model",
        resourceId: m.id || m.name || undefined,
        metadata: {},
      });
    }

    if (body?.setDefaultModelId) {
      for (const m of s.ai.models!) {
        m.isDefault = m.id === body.setDefaultModelId;
        if (m.isDefault) m.enabled = true;
      }
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "ai.default_model_changed",
        resourceType: "ai_model",
        resourceId: body.setDefaultModelId,
      });
    }

    if (body?.defaultModel) {
      for (const m of s.ai.models!) {
        m.isDefault = m.name === body.defaultModel;
      }
    }

    ensureAiCatalog(s.ai);
    s.ai.updatedAt = now;
    s.ai.updatedBy = session.userId;
  }).catch((e: Error) => e);

  if (store instanceof Error) {
    const map: Record<string, number> = {
      PROVIDER_NOT_FOUND: 404,
      MODEL_NOT_FOUND: 404,
      INVALID_PROVIDER: 400,
    };
    return NextResponse.json(
      { error: store.message },
      { status: map[store.message] || 400 },
    );
  }

  return NextResponse.json(publicAiSummary(store.ai));
}

export async function POST(req: NextRequest) {
  const { error } = await requirePermission("ai.write", req);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as { providerId?: string };
  const { readStore } = await import("@/lib/server/db");
  const { decryptSecret } = await import("@/lib/server/session");
  const store = await readStore();
  ensureAiCatalog(store.ai);

  const provider =
    (body.providerId && store.ai.providers?.find((p) => p.id === body.providerId)) ||
    store.ai.providers?.find((p) => p.enabled) ||
    null;

  const isGemini = provider?.type === "gemini";
  const key =
    (provider?.apiKeyEnc ? decryptSecret(provider.apiKeyEnc) : "") ||
    (isGemini
      ? process.env.GEMINI_API_KEY || ""
      : (store.ai.apiKeyEnc ? decryptSecret(store.ai.apiKeyEnc) : "") ||
        process.env.GROQ_API_KEY ||
        "");

  if (!key) {
    return NextResponse.json({ ok: false, error: "No API key configured for this provider." }, { status: 400 });
  }

  try {
    const fallbackEndpoint = isGemini
      ? DEFAULT_ENDPOINTS.gemini
      : store.ai.endpoint || DEFAULT_ENDPOINTS.groq;
    const endpoint = (provider?.endpoint || fallbackEndpoint).replace(/\/$/, "");
    // Gemini authenticates with x-goog-api-key rather than a bearer token.
    const res = await fetch(`${endpoint}/models`, {
      headers: isGemini ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Provider responded with ${res.status}` });
    }
    return NextResponse.json({
      ok: true,
      message: "Connection successful.",
      providerId: provider?.id || null,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Connection failed",
    });
  }
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requirePermission("ai.write", req);
  if (error || !session) return error;
  const providerId = req.nextUrl.searchParams.get("providerId");
  const modelId = req.nextUrl.searchParams.get("modelId");
  if (!providerId && !modelId) {
    return NextResponse.json({ error: "providerId or modelId required" }, { status: 400 });
  }

  const store = await updateStore(async (s) => {
    ensureAiCatalog(s.ai);
    if (providerId) {
      const before = s.ai.providers!.length;
      s.ai.providers = s.ai.providers!.filter((p) => p.id !== providerId);
      if (s.ai.providers.length === before) throw new Error("PROVIDER_NOT_FOUND");
      s.ai.models = s.ai.models!.filter((m) => m.providerId !== providerId);
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "ai.provider_removed",
        resourceType: "ai_provider",
        resourceId: providerId,
      });
    }
    if (modelId) {
      const before = s.ai.models!.length;
      s.ai.models = s.ai.models!.filter((m) => m.id !== modelId);
      if (s.ai.models.length === before) throw new Error("MODEL_NOT_FOUND");
      if (!s.ai.models.some((m) => m.isDefault) && s.ai.models[0]) {
        s.ai.models[0].isDefault = true;
      }
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "ai.model_removed",
        resourceType: "ai_model",
        resourceId: modelId,
      });
    }
    ensureAiCatalog(s.ai);
  }).catch((e: Error) => e);

  if (store instanceof Error) {
    return NextResponse.json({ error: store.message }, { status: 404 });
  }
  return NextResponse.json(publicAiSummary(store.ai));
}
