import { canAccessAdmin } from "@/lib/roles";
import { isResumeProductMode, isResumeProductPath } from "@/lib/product-mode";

export type CueAiNavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  pinBottom?: boolean;
};

/** Single CueAI navigation source of truth. Filter with visibleCueAiNav(role). */
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
  const resumeMode = opts?.resumeProduct ?? (typeof window !== "undefined" && isResumeProductMode());

  if (isResumeProductPath(path)) {
    return null;
  }

  if (resumeMode) {
    if (path === "/settings" || path.startsWith("/settings/")) {
      return null;
    }
    return "/resume-tailor";
  }

  if (isNormalUser(role)) {
    const blocked = CUEAI_NAV.find((item) => item.adminOnly && matchesNavPath(path, item.href));
    if (blocked) return "/dashboard";
    const feed = meetingFeedRedirect(path);
    if (feed) return feed;
  }

  return null;
}
