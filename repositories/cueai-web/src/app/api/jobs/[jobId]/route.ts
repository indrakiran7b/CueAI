import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrDevice, upstreamSessionCookieHeader } from "@/lib/server/api-auth";
import { liveCorsHeaders, withLiveCors } from "@/lib/server/live-cors";

const CORS_HEADERS = liveCorsHeaders("GET, OPTIONS");

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { error, session } = await requireAuthOrDevice(request);
  if (error || !session) {
    return withLiveCors(
      error || NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      "GET, OPTIONS",
    );
  }

  const { jobId } = await context.params;
  const base = (process.env.CUEAI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: upstreamSessionCookieHeader(session, request.headers.get("cookie")),
      },
      cache: "no-store",
    });
    const headers = new Headers(CORS_HEADERS);
    const type = upstream.headers.get("content-type");
    if (type) headers.set("content-type", type);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json(
      { error: "CueAI API is not running. Start apps/api." },
      { status: 503, headers: CORS_HEADERS },
    );
  }
}
