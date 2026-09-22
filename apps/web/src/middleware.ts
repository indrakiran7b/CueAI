import { NextRequest, NextResponse } from "next/server";
import { AUTH_BYPASS } from "@/lib/auth-mode";
import {
  SESSION_COOKIE,
  verifySessionEdge,
} from "@/lib/server/session-edge";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/api/auth",
  "/_next",
  "/favicon",
  "/icons",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Protect app pages and authenticated APIs. Role checks for Admin still happen
 * in requirePermission / RequireAdmin (live role from store).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (AUTH_BYPASS) {
    return NextResponse.next();
  }

  // Live desktop helpers stay reachable without a browser cookie (local Electron).
  // Meeting history APIs still require auth via route handlers.
  if (
    pathname.startsWith("/api/live/") ||
    pathname.startsWith("/api/transcribe") ||
    pathname.startsWith("/api/health")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionEdge(token);

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
