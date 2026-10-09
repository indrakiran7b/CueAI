import { NextResponse } from "next/server";

/** Overlay uses header auth from a different origin. Do not pair CORS * with credentialed cookies. */
export const LIVE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, X-CueAI-Device-Id, X-CueAI-Device-Credential",
};

export function liveCorsHeaders(methods: string): Record<string, string> {
  return {
    ...LIVE_CORS_HEADERS,
    "Access-Control-Allow-Methods": methods,
  };
}

export function withLiveCors(res: NextResponse, methods?: string) {
  const headers = methods ? liveCorsHeaders(methods) : LIVE_CORS_HEADERS;
  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }
  return res;
}
