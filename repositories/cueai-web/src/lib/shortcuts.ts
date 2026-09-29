/**
 * Platform-aware keyboard shortcut labels and primary-modifier checks.
 * Uses Electron `cueDesktop.isMac` when present; otherwise browser platform.
 */

export type ShortcutPart = "mod" | "shift" | "alt" | "enter" | string;

/** True for macOS / iOS (Electron Mac shell or Apple browser). */
export function isApplePlatform(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const desktop = (
      window as Window & { cueDesktop?: { isMac?: boolean; isDesktop?: boolean } }
    ).cueDesktop;
    // Explicit Windows/Linux Electron shell must never show ⌘.
    if (desktop?.isDesktop && !desktop.isMac) return false;
    if (desktop?.isMac) return true;
    if (document.documentElement.dataset.desktop === "mac") return true;
    const desktopParam = new URLSearchParams(window.location.search).get("desktop");
    if (desktopParam === "windows" || desktopParam === "linux") return false;
    if (desktopParam === "mac") return true;
  } catch {
    /* ignore */
  }

  const nav = window.navigator;
  const platform = nav.platform || "";
  if (/Win/i.test(platform) || /Linux/i.test(platform)) return false;
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) return true;

  const uaData = (
    nav as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  if (uaData?.platform === "Windows" || uaData?.platform === "Linux") return false;
  if (uaData?.platform === "macOS") return true;

  const ua = nav.userAgent || "";
  if (/Windows|Linux/i.test(ua)) return false;
  if (/Macintosh|Mac OS X/i.test(ua) && !/like Mac OS X/i.test(ua)) return true;

  return false;
}

export function getModifierKey(): string {
  return isApplePlatform() ? "⌘" : "Ctrl";
}

function mapPart(part: ShortcutPart, apple: boolean): string {
  if (part === "mod") return apple ? "⌘" : "Ctrl";
  if (part === "shift") return apple ? "⇧" : "Shift";
  if (part === "alt") return apple ? "⌥" : "Alt";
  if (part === "enter") return apple ? "↵" : "Enter";
  return part;
}

/**
 * Format a shortcut for display.
 * macOS: `⌘ K`, `⌘ ⇧ Space`, `⌘ ↵`
 * Windows/Linux: `Ctrl + K`, `Ctrl + Shift + Space`, `Ctrl + Enter`
 */
export function formatShortcut(...parts: ShortcutPart[]): string {
  const apple = isApplePlatform();
  const tokens = parts.map((p) => mapPart(p, apple));
  return apple ? tokens.join(" ") : tokens.join(" + ");
}

/** Primary app modifier: ⌘ on Apple, Ctrl elsewhere. */
export function isPrimaryModifier(
  event: Pick<KeyboardEvent, "metaKey" | "ctrlKey">,
): boolean {
  return isApplePlatform() ? event.metaKey : event.ctrlKey;
}

/** Accept either ⌘ or Ctrl (common for in-app search / palette). */
export function isModKey(
  event: Pick<KeyboardEvent, "metaKey" | "ctrlKey">,
): boolean {
  return event.metaKey || event.ctrlKey;
}

/** Named CueAI shortcuts used in Settings / chrome. */
export const CUEAI_SHORTCUTS = [
  { action: "Toggle Companion", parts: ["mod", "shift", "Space"] as const },
  { action: "Settings", parts: ["mod", ","] as const },
  { action: "Command palette", parts: ["mod", "K"] as const },
  { action: "Close window", parts: ["mod", "W"] as const },
  { action: "Minimize", parts: ["mod", "M"] as const },
  { action: "Ask / primary action", parts: ["mod", "enter"] as const },
] as const;
