import { NextRequest, NextResponse } from "next/server";
import { AUTH_BYPASS } from "@/lib/auth-mode";
import {
  SESSION_COOKIE,
  verifySessionEdge,
} from "@/lib/server/session-edge";

/**
 * Middleware only verifies authentication for Admin routes.
 * Role/permission checks MUST happen in API handlers (requirePermission)
 * and RequireAdmin, which read the live role from the workspace store.
 *
 * Trusting JWT role here caused invited Admins to stay blocked when their
 * cookie still had role=User after the DB membership was upgraded.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (AUTH_BYPASS) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionEdge(token);

  if (!session) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
