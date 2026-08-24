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

/** Handle cueai://… — returns true if recognized. */
export function handleProtocolUrl(raw: string | null | undefined): boolean {
  if (!raw || !raw.startsWith(`${CUEAI_PROTOCOL}://`)) return false;

  let pathname = "";
  try {
    const u = new URL(raw);
    pathname = `${u.hostname}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    pathname = raw
      .slice(`${CUEAI_PROTOCOL}://`.length)
      .split("?")[0]
      ?.replace(/\/+$/, "")
      .toLowerCase() ?? "";
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
