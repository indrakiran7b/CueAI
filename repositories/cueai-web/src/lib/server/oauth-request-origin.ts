import { NextRequest } from "next/server";

function hostHasExplicitPort(host: string): boolean {
  return /:\d+$/.test(host) || /^\[[:0-9a-fA-F]+\]:\d+$/.test(host);
}

export function isElectronUserAgent(userAgent: string | null | undefined): boolean {
  return /Electron\//i.test(userAgent || "");
}

function pinLoopbackOrigin(origin: string): string {
  const url = new URL(origin);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return origin;
  url.hostname = "127.0.0.1";
  return url.origin;
}

/** Browser origin for NextAuth OAuth redirect_uri (localhost vs 127.0.0.1). */
export function originFromRequest(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  let host = forwardedHost || req.headers.get("host") || req.nextUrl.host;
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = (forwardedProto || req.nextUrl.protocol.replace(":", "") || "http").replace(
    /:$/,
    "",
  );
  const urlPort = req.nextUrl.port;
  if (
    host &&
    !hostHasExplicitPort(host) &&
    urlPort &&
    urlPort !== "80" &&
    urlPort !== "443"
  ) {
    host = `${host}:${urlPort}`;
  }
  const origin = `${proto}://${host}`;
  // Electron device verify always uses 127.0.0.1. Keep the HMAC cookie on that host.
  if (isElectronUserAgent(req.headers.get("user-agent"))) {
    return pinLoopbackOrigin(origin);
  }
  return origin;
}

/**
 * OAuth redirect_uri must use the exact host the browser is on, or the PKCE/state
 * cookies (set on that host) are missing at the callback and Auth.js fails with
 * InvalidCheck. Two things break that:
 * - next-auth rewrites the request to AUTH_URL whenever AUTH_URL is set.
 * - Every NextRequest normalizes 127.0.0.1 and [::1] to "localhost" in `req.url`.
 * So during the handshake AUTH_URL/NEXTAUTH_URL are unset (Auth.js then reads the
 * Host headers) and Auth.js receives a plain Request that keeps the real host.
 */
function isOAuthHandshakePath(pathname: string): boolean {
  return (
    pathname.includes("/signin/") ||
    pathname.includes("/callback/") ||
    pathname.endsWith("/signin") ||
    pathname.endsWith("/callback")
  );
}

export async function withBrowserOAuthOrigin<T>(
  req: NextRequest,
  run: (req: NextRequest) => Promise<T>,
): Promise<T> {
  const path = new URL(req.url).pathname;
  // Session/CSRF/providers must not rewrite AUTH_URL. Doing so races the
  // PKCE cookie host against the Google callback and yields InvalidCheck.
  if (!isOAuthHandshakePath(path)) {
    return run(req);
  }

  const origin = originFromRequest(req);
  const url = new URL(req.url);
  const dest = new URL(origin);
  url.protocol = dest.protocol;
  url.host = dest.host;
  const headers = new Headers(req.headers);
  headers.set("host", dest.host);
  headers.set("x-forwarded-host", dest.host);
  headers.set("x-forwarded-proto", dest.protocol.replace(":", ""));
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  const aligned = new Request(url.toString(), { method: req.method, headers, body });

  const prevAuthUrl = process.env.AUTH_URL;
  const prevNextAuthUrl = process.env.NEXTAUTH_URL;
  delete process.env.AUTH_URL;
  delete process.env.NEXTAUTH_URL;
  console.info("[auth] oauth.callback_origin", { origin, path });
  try {
    return await run(aligned as NextRequest);
  } finally {
    if (prevAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = prevAuthUrl;
    if (prevNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = prevNextAuthUrl;
  }
}
