import { NextRequest, NextResponse } from "next/server";
import { getOAuthProviders } from "@/auth";
import { proxyToFastApi } from "@/lib/server/fastapi-proxy";

export async function GET(req: NextRequest) {
  const proxied = await proxyToFastApi(req, "/v1/auth/providers");
  if (proxied) return proxied;

  const res = NextResponse.json(getOAuthProviders());
  res.headers.set("Cache-Control", "private, max-age=5");
  return res;
}
