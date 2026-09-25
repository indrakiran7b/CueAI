import { NextResponse } from "next/server";
import {
  appendMeetingExchange,
  appendMeetingQuestionOnly,
  appendMeetingTranscript,
  getActiveMeeting,
  getMeeting,
} from "@/lib/server/meetings";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Append live meeting events without blocking AI.
 * Body:
 *  { type: "transcript", who, text, source?, meetingId? }
 *  { type: "exchange", prompt, answer, provider?, model?, latencyMs?, source?, questionWho?, meetingId? }
 *  { type: "question", prompt, questionWho?, meetingId? }  // question with failed/empty answer
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.type !== "string") {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    let meetingId =
      typeof body.meetingId === "string" && body.meetingId.trim()
        ? body.meetingId.trim()
        : null;
    if (!meetingId) {
      const active = await getActiveMeeting();
      meetingId = active?.id || null;
    }
    if (!meetingId) {
      return NextResponse.json(
        { ok: false, error: "no_active_meeting" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const meeting = await getMeeting(meetingId);
    if (!meeting || meeting.status !== "live") {
      return NextResponse.json(
        { ok: false, error: "meeting_not_live" },
        { status: 409, headers: CORS_HEADERS },
      );
    }

    if (body.type === "transcript") {
      const who = String(body.who || "Speaker");
      const text = String(body.text || "").trim();
      if (!text) {
        return NextResponse.json(
          { error: "text required" },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      const source =
        body.source === "system" ||
        body.source === "microphone" ||
        body.source === "screen" ||
        body.source === "user" ||
        body.source === "cueai"
          ? body.source
          : who === "You"
            ? "microphone"
            : who === "System" || who === "Interviewer"
              ? "system"
              : undefined;
      await appendMeetingTranscript(meetingId, [{ who, text, source }]);
      return NextResponse.json({ ok: true, meetingId }, { headers: CORS_HEADERS });
    }

    if (body.type === "exchange") {
      const prompt = String(body.prompt || "").trim();
      const answer = String(body.answer || "").trim();
      if (!prompt) {
        return NextResponse.json(
          { error: "prompt required" },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      await appendMeetingExchange(meetingId, prompt, answer, {
        provider: typeof body.provider === "string" ? body.provider : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
        latencyMs: typeof body.latencyMs === "number" ? body.latencyMs : undefined,
        source:
          body.source === "manual" || body.source === "screen" || body.source === "auto"
            ? body.source
            : "auto",
        questionWho: typeof body.questionWho === "string" ? body.questionWho : "Interviewer",
        status: body.status === "failed" ? "failed" : "ok",
      });
      return NextResponse.json({ ok: true, meetingId }, { headers: CORS_HEADERS });
    }

    if (body.type === "question") {
      const prompt = String(body.prompt || "").trim();
      if (!prompt) {
        return NextResponse.json(
          { error: "prompt required" },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      await appendMeetingQuestionOnly(
        meetingId,
        prompt,
        typeof body.questionWho === "string" ? body.questionWho : "Interviewer",
      );
      return NextResponse.json({ ok: true, meetingId }, { headers: CORS_HEADERS });
    }

    return NextResponse.json({ error: "unknown type" }, { status: 400, headers: CORS_HEADERS });
  } catch (err) {
    console.error("meeting_event_error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "event_failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
