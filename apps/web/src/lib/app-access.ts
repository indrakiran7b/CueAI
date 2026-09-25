import { canAccessAdmin } from "@/lib/roles";

export const CUEAI_USER_NAV = [
  "/dashboard",
  "/meetings",
  "/meetings/live",
  "/companion",
  "/settings",
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
 * Resume Tailor stays a public/web product; it is blocked only inside the macOS app.
 */
export function restrictedCueAiPath(
  pathname: string,
  role?: string | null,
  opts?: { macDesktop?: boolean },
): string | null {
  const path = pathname.split("?")[0] || "/";

  if (path === "/resume" || path.startsWith("/resume/")) {
    return opts?.macDesktop ? "/dashboard" : null;
  }

  if (path === "/knowledge" || path.startsWith("/knowledge/")) {
    return "/dashboard";
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

  return null;
}

export function isCueAiUserNavHref(href: string): boolean {
  if (href === "/meetings/live") return true;
  if (href === "/meetings") return true;
  return (CUEAI_USER_NAV as readonly string[]).includes(href);
}
