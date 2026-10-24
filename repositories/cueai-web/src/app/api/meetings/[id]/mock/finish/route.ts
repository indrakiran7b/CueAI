import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { finishMockMeeting, mockInterviewErrorResponse } from "@/lib/server/mock-interview";

export const runtime = "nodejs";
export const maxDuration = 90;

type Ctx = { params: Promise<{ id: string }> };

/** End the mock interview and save its results to the meeting (generated once). Owner only. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ mock: await finishMockMeeting(session, id) });
  } catch (err) {
    const { status, body } = mockInterviewErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
