import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API = "http://127.0.0.1:8000";

function apiBase(): string | null {
  if (process.env.CUEAI_USE_FASTAPI !== "1" && process.env.CUEAI_USE_FASTAPI !== "true") {
    return null;
  }
  return (process.env.CUEAI_API_URL || DEFAULT_API).replace(/\/$/, "");
}

/**
 * Forward a Next.js App Router request to FastAPI when CUEAI_USE_FASTAPI is enabled.
 * Returns null when proxying is disabled (legacy handlers run).
 */
export async function proxyToFastApi(
  req: NextRequest | Request,
  fastApiPath: string,
): Promise<NextResponse | null> {
  const base = apiBase();
  if (!base) return null;

  const url = `${base}${fastApiPath.startsWith("/") ? fastApiPath : `/${fastApiPath}`}`;
  const method = req.method.toUpperCase();
  const headers = new Headers();

  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    const resHeaders = new Headers();
    const setCookie = upstream.headers.getSetCookie?.() ?? [];
    if (setCookie.length > 0) {
      for (const c of setCookie) resHeaders.append("set-cookie", c);
    } else {
      const single = upstream.headers.get("set-cookie");
      if (single) resHeaders.set("set-cookie", single);
    }
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) resHeaders.set("content-type", upstreamType);

    const payload = await upstream.arrayBuffer();
    return new NextResponse(payload, { status: upstream.status, headers: resHeaders });
  } catch {
    return NextResponse.json(
      { error: "FastAPI backend unavailable. Start apps/api or disable CUEAI_USE_FASTAPI." },
      { status: 503 },
    );
  }
}
