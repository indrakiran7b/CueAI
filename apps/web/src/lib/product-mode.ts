export type CueProduct = "cueai" | "resume";

const STORAGE_KEY = "cueai-product";

export function isResumeProductPath(pathname?: string | null): boolean {
  const path = (pathname || "").split("?")[0] || "/";
  return (
    path === "/resume" ||
    path.startsWith("/resume/") ||
    path === "/resume-tailor" ||
    path.startsWith("/resume-tailor/")
  );
}

export function persistProductMode(mode?: string | null) {
  if (typeof window === "undefined") return;
  if (mode === "resume" || mode === "cueai") {
    sessionStorage.setItem(STORAGE_KEY, mode);
  }
}

export function persistProductFromSearch(search?: string | null) {
  if (typeof window === "undefined") return;
  const raw = search ?? window.location.search;
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  persistProductMode(params.get("product"));
}

export function getProductMode(): CueProduct {
  if (typeof window === "undefined") return "cueai";
  try {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("product");
    if (query === "resume" || query === "cueai") {
      persistProductMode(query);
      return query;
    }
    return sessionStorage.getItem(STORAGE_KEY) === "resume" ? "resume" : "cueai";
  } catch {
    return "cueai";
  }
}

export function isResumeProductMode() {
  return getProductMode() === "resume";
}

export function withProductParam(path: string) {
  if (typeof window === "undefined") return path;
  if (getProductMode() !== "resume") return path;
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("product", "resume");
  return `${pathname}?${params.toString()}`;
}
