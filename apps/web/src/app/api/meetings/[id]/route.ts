import { NextRequest, NextResponse } from "next/server";
import { getMeetingById } from "@/lib/meetings-catalog";
import { requireAuth } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/meetings/[id] — full meeting record including transcript & translations. */
export async function GET(req: NextRequest, context: RouteContext) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const { id } = await context.params;
  const meeting = getMeetingById(id);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  return NextResponse.json({ meeting });
}
