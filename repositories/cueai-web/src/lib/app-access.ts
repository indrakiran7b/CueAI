import { canAccessAdmin, canAccessResumeTailor } from "@/lib/roles";
import { isResumeProductPath } from "@/lib/product-mode";

export type CueAiNavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  pinBottom?: boolean;
};

/** Single CueAI navigation source of truth. Filter with visibleCueAiNav(role). */
/** Web-only products — must not open inside Electron (Windows + macOS). */
export const DESKTOP_WEB_ONLY_PREFIXES = ["/resume", "/resume-tailor"] as const;

export const CUEAI_NAV: CueAiNavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
  { href: "/meetings/live", label: "Live Session" },
  { href: "/translation", label: "Translation", adminOnly: true },
  { href: "/companion", label: "Desktop Companion" },
  { href: "/screen-context", label: "Screen Context", adminOnly: true },
  { href: "/knowledge", label: "Knowledge Base", adminOnly: true },
  { href: "/admin", label: "Admin Portal", adminOnly: true },
  { href: "/settings", label: "Settings", pinBottom: true },
];

export function isAdminUser(role?: string | null): boolean {
  return canAccessAdmin(role);
}

export function isNormalUser(role?: string | null): boolean {
  return !canAccessAdmin(role);
}

export function visibleCueAiNav(role?: string | null): CueAiNavItem[] {
  const admin = isAdminUser(role);
  return CUEAI_NAV.filter((item) => !item.adminOnly || admin);
}

export function isCueAiUserNavHref(href: string): boolean {
  const item = CUEAI_NAV.find((entry) => entry.href === href);
  return Boolean(item && !item.adminOnly);
}

/** Rewrite a link so USER cannot be sent to admin-only CueAI routes. */
export function safeCueAiHref(href: string, role?: string | null): string {
  const path = href.split("?")[0] || "/";
  return restrictedCueAiPath(path, role) ?? href;
}

function meetingFeedRedirect(pathname: string): string | null {
  const match = pathname.match(/^\/meetings\/([^/]+)\/feed\/?$/);
  if (!match?.[1]) return null;
  return `/meetings/${match[1]}/summary`;
}

function matchesNavPath(pathname: string, href: string): boolean {
  if (href === "/meetings") {
    return pathname === "/meetings" || (pathname.startsWith("/meetings/") && !pathname.startsWith("/meetings/live"));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Authenticated CueAI route policy.
 * Role comes from the signed session / store membership, not email or workspace name.
 */
export function restrictedCueAiPath(
  pathname: string,
  role?: string | null,
  opts?: { macDesktop?: boolean; resumeProduct?: boolean },
): string | null {
  const path = pathname.split("?")[0] || "/";

  if (isResumeProductPath(path)) {
    if (!canAccessResumeTailor(role)) return "/resume-tailor/denied";
    return null;
  }

  if (isNormalUser(role)) {
    const blocked = CUEAI_NAV.find((item) => item.adminOnly && matchesNavPath(path, item.href));
    if (blocked) return "/dashboard";
    const feed = meetingFeedRedirect(path);
    if (feed) return feed;
  }

  return null;
}

export function isDesktopWebOnlyPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  return DESKTOP_WEB_ONLY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isDesktopBlockedPath(pathname: string): boolean {
  return isDesktopWebOnlyPath(pathname);
}

/** @deprecated Prefer visibleCueAiNav */
export const CUEAI_USER_NAV_HREFS = CUEAI_NAV.filter((i) => !i.adminOnly).map((i) => i.href);

/** @deprecated Prefer isCueAiUserNavHref */
export const isCueaiUserNavHref = isCueAiUserNavHref;
