import { NextRequest, NextResponse } from "next/server";
import { beginDesktopGoogleHandoff } from "@/lib/server/desktop-google-handoff";
import { originFromRequest } from "@/lib/server/oauth-request-origin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    deviceId?: string;
    platform?: string;
    state?: string;
    challenge?: string;
    loopbackOrigin?: string;
  } | null;

  const result = await beginDesktopGoogleHandoff({
    deviceId: body?.deviceId || "",
    platform: body?.platform || "",
    state: body?.state || "",
    challenge: body?.challenge || "",
    loopbackOrigin: body?.loopbackOrigin || "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }

  const origin = originFromRequest(req);
  return NextResponse.json({
    ok: true,
    browserUrl: `${origin}${result.browserPath}`,
  });
}
