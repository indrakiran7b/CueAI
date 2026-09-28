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

/** Web-only product routes — blocked inside Electron (Windows + macOS). */
export const DESKTOP_WEB_ONLY_PREFIXES = ["/resume", "/resume-tailor"] as const;

export function isAdminUser(role?: string | null): boolean {
  return canAccessAdmin(role);
}

export function isNormalUser(role?: string | null): boolean {
  return !canAccessAdmin(role);
}

/** Resume Tailor: any authenticated CueAI account (User, Manager, Admin). */
export function canAccessResumeTailor(_role?: string | null): boolean {
  return true;
}

function meetingFeedRedirect(pathname: string): string | null {
  const match = pathname.match(/^\/meetings\/([^/]+)\/feed\/?$/);
  if (!match?.[1]) return null;
  return `/meetings/${match[1]}/summary`;
}

/**
 * Authenticated CueAI route policy.
 * Resume Tailor lives outside the CueAI app shell.
 * Knowledge Base / Admin / Translation / Screen Context are Admin+Manager via role guard.
 */
export function restrictedCueAiPath(
  pathname: string,
  role?: string | null,
  opts?: { macDesktop?: boolean },
): string | null {
  const path = pathname.split("?")[0] || "/";

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

/** Paths that must never open inside the desktop shell. */
export function isDesktopWebOnlyPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  return DESKTOP_WEB_ONLY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Electron shell blocks only web-only products (Resume Tailor).
 * Role-gated routes (Admin Portal, Translation, Screen Context, Knowledge)
 * remain available on Desktop for Admin/Manager — CueAiRouteGate enforces roles.
 */
export function isDesktopBlockedPath(pathname: string): boolean {
  return isDesktopWebOnlyPath(pathname);
}

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
