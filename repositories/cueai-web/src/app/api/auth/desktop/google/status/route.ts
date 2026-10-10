import { NextRequest, NextResponse } from "next/server";
import {
  getDesktopGoogleTicketStatus,
  googleDesktopConfigured,
} from "@/lib/server/desktop-google-handoff";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") || "";
  if (!googleDesktopConfigured()) {
    return NextResponse.json(
      { ok: false, code: "google_not_configured", error: "Google sign-in is not configured on the CueAI server." },
      { status: 503 },
    );
  }
  const status = await getDesktopGoogleTicketStatus(state);
  if (!status.ok) {
    return NextResponse.json(
      { ok: false, code: status.code, error: "This desktop Google sign-in request is not valid." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, platform: status.platform, ready: status.ready });
}
