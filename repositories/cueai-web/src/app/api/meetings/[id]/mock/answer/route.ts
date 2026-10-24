import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { answerMockMeeting, mockInterviewErrorResponse } from "@/lib/server/mock-interview";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Save the answer to the current question, evaluate it, and return the next question. Owner only. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { turnId?: unknown; answer?: unknown; source?: unknown; skip?: unknown }
    | null;
  if (typeof body?.turnId !== "string" || !body.turnId) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Missing question id.", retryable: false } },
      { status: 400 },
    );
  }
  try {
    const outcome = await answerMockMeeting(session, id, {
      turnId: body.turnId,
      answer: body.answer,
      source: body.source,
      skip: body.skip === true,
      signal: req.signal,
    });
    return NextResponse.json(outcome);
  } catch (err) {
    const { status, body: errBody } = mockInterviewErrorResponse(err);
    return NextResponse.json(errBody, { status });
  }
}
