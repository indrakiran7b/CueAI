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
 * Auth.js rewrites the request origin to AUTH_URL (often 127.0.0.1).
 * Google then receives a redirect_uri that does not match the browser host
 * (localhost). Temporarily align AUTH_URL with the incoming Host header.
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
  const aligned = new NextRequest(url, req);
  aligned.headers.set("host", dest.host);
  aligned.headers.set("x-forwarded-host", dest.host);
  aligned.headers.set("x-forwarded-proto", dest.protocol.replace(":", ""));

  const prevAuthUrl = process.env.AUTH_URL;
  const prevNextAuthUrl = process.env.NEXTAUTH_URL;
  process.env.AUTH_URL = origin;
  process.env.NEXTAUTH_URL = origin;
  console.info("[auth] oauth.callback_origin", { origin, path });
  try {
    return await run(aligned);
  } finally {
    if (prevAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = prevAuthUrl;
    if (prevNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = prevNextAuthUrl;
  }
}
