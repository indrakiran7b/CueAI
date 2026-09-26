import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { runTranslateRequest } from "@/lib/server/translate-request";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Admin transcript translation page. Same translator as /api/translate. */
export async function POST(request: NextRequest) {
  const { error } = await requirePermission("admin.access", request);
  if (error) return error;
  const body = await request.json().catch(() => null);
  const result = await runTranslateRequest(body);
  return NextResponse.json(result.body, { status: result.status });
}
