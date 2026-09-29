import { NextRequest, NextResponse } from "next/server";
import { proxyToFastApi } from "@/lib/server/fastapi-proxy";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  const proxied = await proxyToFastApi(req, "/v1/auth/logout");
  if (proxied) return proxied;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}
