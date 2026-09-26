import { NextRequest, NextResponse } from "next/server";
import { canViewFullTranscript } from "@/lib/entitlements";
import { requireAuth } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import {
  canAccessMeeting,
  deleteMeeting,
  finalizeMeeting,
  getMeeting,
  isLiveMeeting,
  publicMeeting,
} from "@/lib/server/meetings";
import type { DbMeetingLine } from "@/lib/server/db";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAuth(req);
  if (error || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const { id } = await ctx.params;
  const stored = await getMeeting(id);
  if (!stored || !canAccessMeeting(stored, session)) {
    return NextResponse.json(
      { error: "Meeting not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // History detail is for completed meetings only — never reopen live via this route.
  if (isLiveMeeting(stored)) {
    return NextResponse.json(
      { error: "This meeting is still live. Use New live session / companion." },
      { status: 409, headers: CORS_HEADERS },
    );
  }

  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  const includeTranscript = canViewFullTranscript({
    role: session.role,
    plan: user?.plan,
  });

  return NextResponse.json(
    { meeting: publicMeeting(stored, true, includeTranscript) },
    { headers: CORS_HEADERS },
  );
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAuth(req);
  if (error || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting || !canAccessMeeting(meeting, session)) {
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
  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  const includeTranscript = canViewFullTranscript({
    role: session.role,
    plan: user?.plan,
  });
  return NextResponse.json(
    { meeting: fresh ? publicMeeting(fresh, true, includeTranscript) : null },
    { headers: CORS_HEADERS },
  );
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAuth(req);
  if (error || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const { id } = await ctx.params;
  const existing = await getMeeting(id);
  if (!existing || !canAccessMeeting(existing, session)) {
    return NextResponse.json(
      { error: "Meeting not found." },
      { status: 404, headers: CORS_HEADERS },
    );
  }
  // Only the owner (or admin) deletes; never delete by index.
  if (
    existing.userId &&
    existing.userId !== session.userId &&
    session.role !== "Admin" &&
    session.role !== "Manager"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: CORS_HEADERS });
  }
  await deleteMeeting(id);
  return NextResponse.json({ ok: true, id }, { headers: CORS_HEADERS });
}
