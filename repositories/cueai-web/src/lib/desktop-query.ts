import { isMacDesktopShellQuery } from "@/lib/desktop";

function macFromWindow() {
  if (typeof window === "undefined") return false;
  try {
    const desktop = (window as Window & { cueDesktop?: { isMac?: boolean; isWindows?: boolean } }).cueDesktop;
    if (desktop?.isWindows) return false;
    if (desktop?.isMac) return true;
    if (document.documentElement.dataset.desktop === "mac") return true;
    return isMacDesktopShellQuery(new URLSearchParams(window.location.search).get("desktop"));
  } catch {
    return false;
  }
}

export function isMacDesktopShell() {
  return macFromWindow();
}

export function persistDesktopQuery() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const desktop = (window as Window & { cueDesktop?: { isWindows?: boolean } }).cueDesktop;
  if (desktop?.isWindows) {
    if (url.searchParams.get("desktop") === "mac" || url.searchParams.get("desktop") === "macos") {
      url.searchParams.delete("desktop");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return;
  }
  if (!macFromWindow()) return;
  if (url.searchParams.get("desktop") === "mac") return;
  url.searchParams.set("desktop", "mac");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function withDesktopParam(path: string) {
  if (typeof window === "undefined") return path;
  if (!macFromWindow()) return path;
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("desktop", "mac");
  const q = params.toString();
  return `${pathname}?${q}`;
}

export function isDesktopMacQuery() {
  if (typeof window === "undefined") return false;
  const desktop = (window as Window & { cueDesktop?: { isWindows?: boolean } }).cueDesktop;
  if (desktop?.isWindows) return false;
  return isMacDesktopShellQuery(new URLSearchParams(window.location.search).get("desktop"));
}
