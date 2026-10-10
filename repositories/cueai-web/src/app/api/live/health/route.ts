import { NextResponse } from "next/server";
import {
  forceLiveAnswerLocal,
  liveAnswerApiUrl,
  localProvidersConfigured,
  probeFastApi,
} from "@/lib/server/live-answer-backend";
import { liveCorsHeaders } from "@/lib/server/live-cors";

export const runtime = "nodejs";

const CORS = liveCorsHeaders("GET, OPTIONS");

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  const forceLocal = forceLiveAnswerLocal();
  const providers = localProvidersConfigured();
  const fastapi = forceLocal ? { reachable: false as const } : await probeFastApi();
  const localReady = providers.groq || providers.gemini;
  const liveAnswer = fastapi.reachable || localReady ? "ready" : "unavailable";
  const mode = forceLocal ? "local" : fastapi.reachable ? "fastapi" : localReady ? "local_fallback" : "unavailable";

  console.info("live_answer_health", {
    mode,
    liveAnswer,
    fastapi: fastapi.reachable ? "ok" : fastapi.error || "skipped",
    groqConfigured: providers.groq,
    geminiConfigured: providers.gemini,
    apiUrl: liveAnswerApiUrl(),
  });

  return NextResponse.json(
    {
      status: liveAnswer === "ready" ? "ok" : "unavailable",
      liveAnswer,
      mode,
      web: "ok",
      fastapi: forceLocal ? "skipped" : fastapi.reachable ? "ok" : fastapi.error || "unreachable",
      apiUrl: liveAnswerApiUrl(),
      groqConfigured: providers.groq,
      geminiConfigured: providers.gemini,
    },
    { status: liveAnswer === "ready" ? 200 : 503, headers: CORS },
  );
}
