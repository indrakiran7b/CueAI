import { NextRequest, NextResponse } from "next/server";
import { listMeetings } from "@/lib/meetings-catalog";
import { requireAuth } from "@/lib/server/api-auth";

/** GET /api/meetings — list meetings for the workspace. */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  return NextResponse.json({ meetings: listMeetings() });
}
