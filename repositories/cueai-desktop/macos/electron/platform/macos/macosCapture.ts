import { BrowserWindow, desktopCapturer, screen } from "electron";
import { requestScreenRecordingPermission } from "./macosPermissions";

export type ScreenshotResult = {
  ok: boolean;
  dataUrl?: string;
  savedPath?: string | null;
  error?: string;
  displayId?: number;
};

export type MacDisplayInfo = {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  primary: boolean;
  internal: boolean;
};

export type MacWindowInfo = {
  id: string;
  name: string;
  displayId?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCueAiWindow(win: BrowserWindow) {
  if (win.isDestroyed()) return false;
  const title = win.getTitle() || "";
  const url = win.webContents.getURL();
  return (
    title === "CueAI" ||
    title.includes("CueAI") ||
    url.includes("/screen-context") ||
    url.includes("127.0.0.1:15175")
  );
}

async function withCueAiHidden<T>(fn: () => Promise<T>): Promise<T> {
  const hidden: { win: BrowserWindow; opacity: number }[] = [];
  for (const win of BrowserWindow.getAllWindows()) {
    if (!isCueAiWindow(win) || !win.isVisible()) continue;
    hidden.push({ win, opacity: win.getOpacity() });
    try {
      win.setOpacity(0);
    } catch {
      // ignore
    }
  }

  if (hidden.length) await sleep(120);

  try {
    return await fn();
  } finally {
    for (const item of hidden) {
      if (item.win.isDestroyed()) continue;
      try {
        item.win.setOpacity(Math.min(1, Math.max(0.35, item.opacity || 1)));
      } catch {
        // ignore
      }
    }
  }
}

export function listMacDisplays(): MacDisplayInfo[] {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label:
      display.label ||
      (display.id === primary.id ? "Built-in Display" : `Display ${index + 1}`),
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    scaleFactor: display.scaleFactor || 1,
    primary: display.id === primary.id,
    internal: display.internal === true,
  }));
}

export async function listMacWindows(): Promise<MacWindowInfo[]> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    });
    return sources
      .filter((source) => {
        const name = (source.name || "").toLowerCase();
        return !name.includes("cueai") && !name.includes("electron");
      })
      .map((source) => ({
        id: source.id,
        name: source.name,
        displayId: source.display_id || undefined,
      }));
  } catch {
    return [];
  }
}

export async function captureMacDisplay(opts?: {
  displayId?: number;
  hideCueAi?: boolean;
}): Promise<ScreenshotResult> {
  const permission = await requestScreenRecordingPermission();
  if (permission.state === "denied" || permission.state === "restricted") {
    return { ok: false, error: permission.message };
  }

  const run = async (): Promise<ScreenshotResult> => {
    const displays = screen.getAllDisplays();
    const target =
      displays.find((d) => opts?.displayId != null && d.id === opts.displayId) ||
      screen.getPrimaryDisplay();
    const scale = target.scaleFactor || 1;
    const width = Math.max(1, Math.round(target.size.width * scale));
    const height = Math.max(1, Math.round(target.size.height * scale));

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width, height },
    });

    const source =
      sources.find((s) => s.display_id && String(target.id) === String(s.display_id)) ||
      sources[0];

    if (!source || source.thumbnail.isEmpty()) {
      return {
        ok: false,
        error:
          permission.state === "granted"
            ? "Could not capture the selected display."
            : permission.message || "Screen Recording is required to capture the desktop.",
      };
    }

    const png = source.thumbnail.toPNG();
    return {
      ok: true,
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      savedPath: null,
      displayId: target.id,
    };
  };

  try {
    return opts?.hideCueAi === false ? await run() : await withCueAiHidden(run);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Screenshot failed",
    };
  }
}
