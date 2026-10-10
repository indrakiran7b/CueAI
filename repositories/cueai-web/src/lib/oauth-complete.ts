/** Public bridge after NextAuth Google/Apple so CueAI HMAC session is minted before protected routes. */

export function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return false;
  if (path.startsWith("/login") || path.startsWith("/signup")) {
    return false;
  }
  if (path.startsWith("/auth/complete") && !path.startsWith("/auth/desktop/")) {
    return false;
  }
  return true;
}

export function oauthBridgeCallbackUrl(nextPath = "/dashboard"): string {
  const next = isSafeInternalPath(nextPath) ? nextPath : "/dashboard";
  return `/auth/complete?next=${encodeURIComponent(next)}`;
}
