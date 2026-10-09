import type { NextRequest } from "next/server";
import {
  OPTIONS as handleTranscribeOptions,
  POST as handleTranscribePost,
} from "@cueai/transcription-service/routes/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

export function OPTIONS() {
  return handleTranscribeOptions();
}

export function POST(request: NextRequest) {
  return handleTranscribePost(request);
}
