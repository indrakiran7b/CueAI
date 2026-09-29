import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const base = (process.env.CUEAI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/v1/live/screen`, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") || "application/json",
        accept: request.headers.get("accept") || "*/*",
        ...(request.headers.get("cookie")
          ? { cookie: request.headers.get("cookie") as string }
          : {}),
      },
      body: await request.arrayBuffer(),
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
