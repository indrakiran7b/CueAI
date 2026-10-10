/**
 * cueai:// deep links — browser / OS can wake Desktop and open the companion.
 * Examples: cueai://companion , cueai://companion/show , cueai://companion/toggle
 */

import path from "node:path";
import { app } from "electron";
import {
  showCompanion,
  toggleCompanion,
  hideCompanion,
} from "../windows/companion-window";

export const CUEAI_PROTOCOL = "cueai";

export function registerCueaiProtocolClient() {
  if (process.defaultApp) {
    // Dev: electron.exe + path to app entry
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(CUEAI_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(CUEAI_PROTOCOL);
  }
}

export function extractProtocolUrl(argv: string[]): string | null {
  const found = argv.find((a) => typeof a === "string" && a.startsWith(`${CUEAI_PROTOCOL}://`));
  return found ?? null;
}

type DesktopAuthCallback = (url: URL) => void;

let desktopAuthCallback: DesktopAuthCallback | null = null;
let pendingDesktopAuthUrl: URL | null = null;

export function onDesktopAuthCallback(handler: DesktopAuthCallback) {
  desktopAuthCallback = handler;
  if (pendingDesktopAuthUrl) {
    const url = pendingDesktopAuthUrl;
    pendingDesktopAuthUrl = null;
    handler(url);
  }
}

function dispatchDesktopAuthCallback(url: URL) {
  if (desktopAuthCallback) {
    desktopAuthCallback(url);
    return;
  }
  pendingDesktopAuthUrl = url;
}

/** Handle cueai://… — returns true if recognized. */
export function handleProtocolUrl(raw: string | null | undefined): boolean {
  if (!raw || !raw.startsWith(`${CUEAI_PROTOCOL}://`)) return false;

  let parsed: URL | null = null;
  let pathname = "";
  try {
    parsed = new URL(raw);
    pathname = `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    pathname = raw
      .slice(`${CUEAI_PROTOCOL}://`.length)
      .split("?")[0]
      ?.replace(/\/+$/, "")
      .toLowerCase() ?? "";
  }

  if (pathname === "auth/callback" && parsed) {
    console.info("[auth] desktop.google.protocol", {
      stage: "callback",
      callbackReceived: true,
      via: "protocol",
    });
    dispatchDesktopAuthCallback(parsed);
    return true;
  }

  if (!pathname || pathname === "companion" || pathname === "companion/show") {
    showCompanion();
    return true;
  }
  if (pathname === "companion/toggle") {
    toggleCompanion();
    return true;
  }
  if (pathname === "companion/hide") {
    hideCompanion();
    return true;
  }

  // Unknown path — still surface the overlay (safe default).
  showCompanion();
  return true;
}
