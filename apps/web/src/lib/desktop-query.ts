function macFromWindow() {
  if (typeof window === "undefined") return false;
  try {
    const desktop = (window as Window & { cueDesktop?: { isMac?: boolean } }).cueDesktop;
    if (desktop?.isMac) return true;
    if (document.documentElement.dataset.desktop === "mac") return true;
    return new URLSearchParams(window.location.search).get("desktop") === "mac";
  } catch {
    return false;
  }
}

export function isMacDesktopShell() {
  return macFromWindow();
}

export function persistDesktopQuery() {
  if (typeof window === "undefined") return;
  if (!macFromWindow()) return;
  const url = new URL(window.location.href);
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
  return new URLSearchParams(window.location.search).get("desktop") === "mac";
}
