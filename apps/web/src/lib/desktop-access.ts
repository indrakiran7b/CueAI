/**
 * Desktop path policy — Resume Tailor and other web-only routes stay out of Electron.
 */
export {
  CUEAI_USER_NAV_HREFS as DESKTOP_USER_NAV_HREFS,
  USER_BLOCKED_PATH_PREFIXES as DESKTOP_BLOCKED_PATH_PREFIXES,
  DESKTOP_WEB_ONLY_PREFIXES,
  isCueaiUserNavHref as isDesktopUserNavHref,
  isDesktopBlockedPath,
  isDesktopWebOnlyPath,
} from "@/lib/app-access";
