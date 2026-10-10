import { NextRequest, NextResponse } from "next/server";
import { finishDesktopGoogleHandoff } from "@/lib/server/desktop-google-handoff";
import { SESSION_COOKIE, verifySession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "CueAI session required.", code: "auth_required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { state?: string } | null;
  const result = await finishDesktopGoogleHandoff({
    state: body?.state || "",
    userId: session.userId,
  });
  if (!result.ok) {
    if (result.code !== "no_open_ticket") {
      console.info("[auth] desktop.google.finish.http", {
        stage: "finish",
        status: result.status,
        category: result.code,
        sessionExchange: false,
      });
    }
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    deeplink: result.deeplink,
    loopbackUrl: result.loopbackUrl,
  });
}
