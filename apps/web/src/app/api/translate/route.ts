import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { runTranslateRequest } from "@/lib/server/translate-request";

export const runtime = "nodejs";
export const maxDuration = 120;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Companion and other signed-in clients. Not admin-only. */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth(request);
  if (error) return error;
  const body = await request.json().catch(() => null);
  const result = await runTranslateRequest(body);
  return NextResponse.json(result.body, { status: result.status, headers: CORS_HEADERS });
}
