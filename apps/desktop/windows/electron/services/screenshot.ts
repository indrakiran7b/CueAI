/**
 * Physical display capture for Screen Context AI.
 * NEVER captures CueAI BrowserWindows / webpage / renderer — only OS screen sources.
 */

import { BrowserWindow, desktopCapturer, screen, type Display } from "electron";
import { getCompanionWindow } from "../windows/companion-window";
import { getStoreValue } from "./store";

export type DisplayInfo = {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  primary: boolean;
};

export type ScreenshotResult = {
  ok: boolean;
  dataUrl?: string;
  savedPath?: string | null;
  error?: string;
  meta?: {
    width: number;
    height: number;
    bytes: number;
    displayId: number;
    displayLabel: string;
    sourceName: string;
  };
};

type WindowSnapshot = {
  win: BrowserWindow;
  wasVisible: boolean;
  opacity: number;
  contentProtected: boolean;
  role: "companion" | "main" | "other";
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCueAiWindow(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false;
  try {
    const title = (win.getTitle() || "").toLowerCase();
    const url = (win.webContents.getURL() || "").toLowerCase();
    if (title.includes("cueai") || title.includes("cue ai")) return true;
    if (url.includes("cueai") || url.includes("/screen-context") || url.includes("/dashboard")) {
      return true;
    }
    if (url.includes("localhost:3000") || url.includes("127.0.0.1:39100") || url.includes("127.0.0.1:15174")) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function classifyWindow(win: BrowserWindow, companion: BrowserWindow | null): WindowSnapshot["role"] {
  if (companion && win.id === companion.id) return "companion";
  try {
    const url = win.webContents.getURL() || "";
    if (url.includes("15174") || win.getTitle() === "CueAI Companion") return "companion";
  } catch {
    // ignore
  }
  return isCueAiWindow(win) ? "main" : "other";
}

function resolveDisplay(displayId?: number | null): Display {
  const all = screen.getAllDisplays();
  if (displayId != null) {
    const match = all.find((d) => d.id === displayId);
    if (match) return match;
  }
  return screen.getPrimaryDisplay();
}

function displayLabel(display: Display, indexHint = 0): string {
  const label = (display.label || "").trim();
  if (label) return label;
  const primary = screen.getPrimaryDisplay();
  if (display.id === primary.id) return "Built-in Display";
  return `Display ${indexHint + 1}`;
}

export function listCaptureDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: displayLabel(d, i),
    bounds: { ...d.bounds },
    workArea: { ...d.workArea },
    scaleFactor: d.scaleFactor || 1,
    primary: d.id === primary.id,
  }));
}

function pickScreenSource(
  sources: Electron.DesktopCapturerSource[],
  display: Display
): Electron.DesktopCapturerSource | undefined {
  const idStr = String(display.id);
  const byDisplayId =
    sources.find((s) => s.display_id && s.display_id === idStr) ||
    sources.find((s) => s.display_id && s.display_id.includes(idStr)) ||
    sources.find((s) => s.id === `screen:${display.id}:0`) ||
    sources.find((s) => s.id.startsWith(`screen:${display.id}:`));

  if (byDisplayId) return byDisplayId;

  // Windows sometimes leaves display_id empty — match by size order with Electron displays.
  const displays = screen.getAllDisplays();
  const idx = displays.findIndex((d) => d.id === display.id);
  const screenSources = sources.filter((s) => s.id.startsWith("screen:"));
  if (idx >= 0 && screenSources[idx]) return screenSources[idx];

  // Last resort: size match (physical pixels)
  const scale = display.scaleFactor || 1;
  const wantW = Math.round(display.size.width * scale);
  const wantH = Math.round(display.size.height * scale);
  return (
    screenSources.find((s) => {
      const sz = s.thumbnail.getSize();
      return Math.abs(sz.width - wantW) < 8 && Math.abs(sz.height - wantH) < 8;
    }) ||
    screenSources[0] ||
    sources[0]
  );
}

function collectCueAiWindows(companion: BrowserWindow | null): WindowSnapshot[] {
  const snaps: WindowSnapshot[] = [];
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const role = classifyWindow(win, companion);
    if (role === "other" && !isCueAiWindow(win)) continue;
    let contentProtected = false;
    try {
      contentProtected =
        typeof win.isContentProtected === "function" ? win.isContentProtected() : false;
    } catch {
      contentProtected = false;
    }
    snaps.push({
      win,
      wasVisible: win.isVisible(),
      opacity: win.getOpacity(),
      contentProtected,
      role: role === "other" ? "main" : role,
    });
  }
  return snaps;
}

async function excludeCueAiFromCapture(snaps: WindowSnapshot[]) {
  for (const snap of snaps) {
    const { win } = snap;
    if (win.isDestroyed()) continue;
    try {
      win.setContentProtection(true);
    } catch {
      // OS may not support
    }
    if (snap.role === "companion") {
      try {
        win.setIgnoreMouseEvents(true);
        win.setOpacity(0);
      } catch {
        // ignore
      }
      console.log("[SCREEN] CueAI overlay excluded");
    } else {
      // Hide the main CueAI shell so Screen Context page is never in the shot.
      if (snap.wasVisible) {
        try {
          win.hide();
        } catch {
          // ignore
        }
      }
      console.log("[SCREEN] CueAI main window hidden for capture");
    }
  }
  // Let the compositor settle so desktopCapturer does not include fading windows.
  await sleep(160);
}

async function restoreCueAiWindows(snaps: WindowSnapshot[]) {
  for (const snap of snaps) {
    const { win } = snap;
    if (win.isDestroyed()) continue;
    try {
      if (snap.role === "companion") {
        const stored = Number(getStoreValue("companionOpacity")) || snap.opacity || 1;
        win.setOpacity(Math.min(1, Math.max(0.35, stored)));
        win.setIgnoreMouseEvents(false);
        if (!snap.contentProtected) {
          // Keep exclusion if settings request it.
          const exclude = getStoreValue("desktopSettings").excludeFromCapture !== false;
          win.setContentProtection(exclude);
        } else {
          win.setContentProtection(true);
        }
      } else {
        if (snap.wasVisible && !win.isVisible()) {
          win.showInactive();
        }
        try {
          win.setContentProtection(snap.contentProtected);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("[SCREEN] Failed to restore CueAI window", err);
    }
  }
  console.log("[SCREEN] CueAI windows restored");
}

/**
 * Capture a physical display as an in-memory image data URL.
 * Hides/excludes all CueAI windows first. Never opens a file picker.
 */
export async function capturePrimaryScreenshot(opts?: {
  save?: boolean;
  displayId?: number | null;
  parent?: BrowserWindow | null;
}): Promise<ScreenshotResult> {
  void opts?.save;
  void opts?.parent;

  const companion = getCompanionWindow();
  const display = resolveDisplay(opts?.displayId);
  const displays = listCaptureDisplays();
  const info = displays.find((d) => d.id === display.id);
  const label = info?.label || displayLabel(display);

  console.log("[SCREEN] Capture requested");
  console.log("[SCREEN] Selected display:", label);
  console.log("[SCREEN] Display bounds:", {
    id: display.id,
    bounds: display.bounds,
    size: display.size,
    scaleFactor: display.scaleFactor,
  });

  const snaps = collectCueAiWindows(companion);

  try {
    await excludeCueAiFromCapture(snaps);

    const scale = display.scaleFactor || 1;
    const maxEdge = 2560;
    const fullW = Math.max(1, Math.round(display.size.width * scale));
    const fullH = Math.max(1, Math.round(display.size.height * scale));
    const longEdge = Math.max(fullW, fullH);
    const factor = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const width = Math.max(1, Math.round(fullW * factor));
    const height = Math.max(1, Math.round(fullH * factor));

    // Screen sources only — never window sources (avoids capturing CueAI BrowserWindow).
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width, height },
      fetchWindowIcons: false,
    });

    const source = pickScreenSource(sources, display);
    if (!source || source.thumbnail.isEmpty()) {
      console.log("[SCREEN] Screenshot failed — empty source");
      return { ok: false, error: "Screen capture failed. Please try again." };
    }

    const sourceName = source.name || source.id;
    const looksLikeCueAiWindow =
      /cue\s*ai/i.test(sourceName) ||
      /screen context/i.test(sourceName) ||
      !source.id.startsWith("screen:");

    if (looksLikeCueAiWindow) {
      console.error(
        "[SCREEN ERROR] Capture source is CueAI window – WRONG SOURCE",
        source.id,
        sourceName
      );
      return {
        ok: false,
        error: "Capture source is CueAI window – WRONG SOURCE",
      };
    }

    console.log("[SCREEN] Physical display screenshot captured", {
      sourceId: source.id,
      sourceName,
      displayId: display.id,
    });

    const png = source.thumbnail.toPNG();
    const size = source.thumbnail.getSize();
    let dataUrl: string;
    let bytes: number;
    if (png.length > 3_500_000) {
      const jpeg = source.thumbnail.toJPEG(92);
      dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
      bytes = jpeg.length;
    } else {
      dataUrl = `data:image/png;base64,${png.toString("base64")}`;
      bytes = png.length;
    }

    console.log("[SCREEN] Screenshot dimensions:", `${size.width}x${size.height}`, bytes);

    return {
      ok: true,
      dataUrl,
      savedPath: null,
      meta: {
        width: size.width,
        height: size.height,
        bytes,
        displayId: display.id,
        displayLabel: label,
        sourceName,
      },
    };
  } catch (err) {
    console.error("[SCREEN] Screenshot failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Screen capture failed. Please try again.",
    };
  } finally {
    await restoreCueAiWindows(snaps);
  }
}
