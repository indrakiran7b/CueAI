import { NextResponse } from "next/server";
import { getMeetingById } from "@/lib/meetings-catalog";
import { finalizeMeeting, getMeeting, publicMeeting } from "@/lib/server/meetings";
import type { DbMeetingLine } from "@/lib/server/db";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stored = await getMeeting(id);
  if (stored) {
    return NextResponse.json(
      { meeting: publicMeeting(stored, true) },
      { headers: CORS_HEADERS },
    );
  }

  const catalog = getMeetingById(id);
  if (catalog) {
    return NextResponse.json({ meeting: catalog }, { headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { error: "Meeting not found" },
    { status: 404, headers: CORS_HEADERS },
  );
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) {
    return NextResponse.json(
      { error: "Meeting not found." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { durationSec?: number; transcript?: DbMeetingLine[]; summary?: string; end?: boolean }
    | null;

  if (body?.end !== false) {
    await finalizeMeeting(id, {
      durationSec: body?.durationSec,
      transcript: body?.transcript,
      summary: body?.summary,
    });
  }

  const fresh = await getMeeting(id);
  return NextResponse.json(
    { meeting: fresh ? publicMeeting(fresh, true) : null },
    { headers: CORS_HEADERS },
  );
}
