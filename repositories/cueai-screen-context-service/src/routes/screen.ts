import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrDevice, upstreamSessionCookieHeader } from "@/lib/server/api-auth";
import { resolveCredentialChain } from "@/lib/server/credential-resolver";
import { liveCorsHeaders, withLiveCors } from "@/lib/server/live-cors";
import { analyzeScreenContext, ScreenContextError } from "@/lib/server/screen-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const CORS_HEADERS = liveCorsHeaders("POST, OPTIONS");

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function analyzeInProcess(
  body: ArrayBuffer,
  session: { userId: string; workspaceId: string },
) {
  let parsed: { image?: unknown; prompt?: unknown; recentContext?: unknown } = {};
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS_HEADERS });
  }
  try {
    const result = await analyzeScreenContext({
      imageDataUrl: typeof parsed.image === "string" ? parsed.image : "",
      prompt: typeof parsed.prompt === "string" ? parsed.prompt.slice(0, 2000) : "",
      recentContext: typeof parsed.recentContext === "string" ? parsed.recentContext : "",
      userId: session.userId,
      workspaceId: session.workspaceId,
    });
    return NextResponse.json(
      {
        ok: true,
        answer: result.answer,
        confidence: result.confidence,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        notice: result.notice || null,
      },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    if (err instanceof ScreenContextError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status, headers: CORS_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "Screen analysis failed. Please retry.", code: "provider_error" },
      { status: 502, headers: CORS_HEADERS },
    );
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuthOrDevice(request);
  if (error || !session) {
    return withLiveCors(
      error || NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      "POST, OPTIONS",
    );
  }

  const body = await request.arrayBuffer();

  // A user's own key is served in-process so it is billed to them and never handed to the worker.
  const chain = await resolveCredentialChain({
    userId: session.userId,
    workspaceId: session.workspaceId,
    capability: "general_ai",
  });
  if (chain.userOwned) return analyzeInProcess(body, session);

  const base = (process.env.CUEAI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/v1/live/screen`, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") || "application/json",
        accept: request.headers.get("accept") || "*/*",
        cookie: upstreamSessionCookieHeader(session, request.headers.get("cookie")),
      },
      body,
    });
    const headers = new Headers(CORS_HEADERS);
    const type = upstream.headers.get("content-type");
    if (type) headers.set("content-type", type);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    // Worker API unreachable: serve with the same app-managed credentials in-process.
    return analyzeInProcess(body, session);
  }
}
