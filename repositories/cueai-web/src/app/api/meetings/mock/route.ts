import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { publicMeeting } from "@/lib/server/meetings";
import { createMockMeeting, mockInterviewErrorResponse } from "@/lib/server/mock-interview";
import { normalizeSetup } from "@/lib/mock-interview-logic";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Start a mock interview as a Meetings session. */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as
    | { setup?: unknown; resumeText?: unknown; clientRequestId?: unknown }
    | null;
  const normalized = normalizeSetup(body?.setup);
  if ("error" in normalized) {
    return NextResponse.json(
      { error: { code: "invalid_setup", message: normalized.error, retryable: false } },
      { status: 400 },
    );
  }
  try {
    const { meeting, created } = await createMockMeeting(session, {
      setup: normalized.setup,
      resumeText: body?.resumeText,
      clientRequestId: body?.clientRequestId,
      signal: req.signal,
    });
    return NextResponse.json(
      { meeting: publicMeeting(meeting, true, false, null, session), created },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    const { status, body: errBody } = mockInterviewErrorResponse(err);
    return NextResponse.json(errBody, { status });
  }
}
