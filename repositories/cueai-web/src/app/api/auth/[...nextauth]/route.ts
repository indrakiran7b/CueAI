import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { withBrowserOAuthOrigin } from "@/lib/server/oauth-request-origin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withBrowserOAuthOrigin(req, (aligned) => handlers.GET(aligned));
}

export async function POST(req: NextRequest) {
  return withBrowserOAuthOrigin(req, (aligned) => handlers.POST(aligned));
}
