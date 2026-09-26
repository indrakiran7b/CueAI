import { canAccessAdmin } from "@/lib/roles";

export const CUEAI_USER_NAV = [
  "/dashboard",
  "/meetings",
  "/meetings/live",
  "/companion",
  "/pricing",
  "/settings",
] as const;

/** @deprecated Prefer CUEAI_USER_NAV */
export const CUEAI_USER_NAV_HREFS = CUEAI_USER_NAV;

export const USER_BLOCKED_PATH_PREFIXES = [
  "/admin",
  "/translation",
  "/screen-context",
] as const;

export function isAdminUser(role?: string | null): boolean {
  return canAccessAdmin(role);
}

export function isNormalUser(role?: string | null): boolean {
  return !canAccessAdmin(role);
}

function meetingFeedRedirect(pathname: string): string | null {
  const match = pathname.match(/^\/meetings\/([^/]+)\/feed\/?$/);
  if (!match?.[1]) return null;
  return `/meetings/${match[1]}/summary`;
}

/**
 * Authenticated CueAI route policy.
 * Resume Tailor (/resume, /resume-tailor) lives outside the CueAI app shell —
 * do not redirect those paths from this helper (they are never under (app)/layout).
 * Knowledge Base is Admin-only.
 */
export function restrictedCueAiPath(
  pathname: string,
  role?: string | null,
  opts?: { macDesktop?: boolean },
): string | null {
  const path = pathname.split("?")[0] || "/";

  // Knowledge Base: Admin Portal users only.
  if (path === "/knowledge" || path.startsWith("/knowledge/")) {
    if (isNormalUser(role)) return "/dashboard";
    return null;
  }

  if ((path === "/admin" || path.startsWith("/admin/")) && isNormalUser(role)) {
    return "/dashboard";
  }

  if (isNormalUser(role)) {
    if (path === "/translation" || path.startsWith("/translation/")) return "/dashboard";
    if (path === "/screen-context" || path.startsWith("/screen-context/")) return "/dashboard";
    const feed = meetingFeedRedirect(path);
    if (feed) return feed;
  }

  void opts;
  return null;
}

export function isUserBlockedPath(pathname: string): boolean {
  return USER_BLOCKED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** True when the role may open this CueAI in-app path. */
export function canAccessCueaiPath(
  pathname: string,
  role?: string | null,
  opts?: { macDesktop?: boolean },
): boolean {
  return restrictedCueAiPath(pathname, role, opts) === null;
}

export function isCueAiUserNavHref(href: string): boolean {
  if (href === "/meetings/live") return true;
  if (href === "/meetings") return true;
  return (CUEAI_USER_NAV as readonly string[]).includes(href);
}

/** @deprecated Prefer isCueAiUserNavHref */
export const isCueaiUserNavHref = isCueAiUserNavHref;
