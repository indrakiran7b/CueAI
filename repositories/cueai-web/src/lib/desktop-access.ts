/**
 * Desktop path policy — Resume Tailor stays out of Electron.
 * Admin Portal / Translation / Screen Context use role guards, not desktop blocks.
 */
export {
  CUEAI_USER_NAV_HREFS as DESKTOP_USER_NAV_HREFS,
  DESKTOP_WEB_ONLY_PREFIXES,
  DESKTOP_WEB_ONLY_PREFIXES as DESKTOP_BLOCKED_PATH_PREFIXES,
  isCueaiUserNavHref as isDesktopUserNavHref,
  isDesktopBlockedPath,
  isDesktopWebOnlyPath,
} from "@/lib/app-access";
