import { NextRequest, NextResponse } from "next/server";
import { proxyToFastApi } from "@/lib/server/fastapi-proxy";

function isRealSecret(value?: string) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (!v) return false;
  const placeholders = [
    "your-client-id",
    "your-client-secret",
    "changeme",
    "xxx",
    "todo",
  ];
  return !placeholders.includes(v);
}

export async function GET(req: NextRequest) {
  const proxied = await proxyToFastApi(req, "/v1/auth/providers");
  if (proxied) return proxied;

  return NextResponse.json({
    google:
      isRealSecret(process.env.AUTH_GOOGLE_ID) &&
      isRealSecret(process.env.AUTH_GOOGLE_SECRET),
    github:
      isRealSecret(process.env.AUTH_GITHUB_ID) &&
      isRealSecret(process.env.AUTH_GITHUB_SECRET),
    apple:
      isRealSecret(process.env.AUTH_APPLE_ID) &&
      isRealSecret(process.env.AUTH_APPLE_SECRET),
  });
}
