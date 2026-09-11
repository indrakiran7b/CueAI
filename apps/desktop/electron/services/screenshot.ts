import { BrowserWindow, desktopCapturer, dialog, screen } from "electron";
import fs from "node:fs/promises";
import { getCompanionWindow } from "../windows/companion-window";
import { getCaptureProtectionStatus } from "./screen-share";
import { getStoreValue } from "./store";

export type ScreenshotResult = {
  ok: boolean;
  dataUrl?: string;
  savedPath?: string | null;
  error?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture the primary display as a PNG.
 * Keep the overlay process alive — only fade it out if capture-exclusion is off.
 */
export async function capturePrimaryScreenshot(opts?: {
  save?: boolean;
  parent?: BrowserWindow | null;
}): Promise<ScreenshotResult> {
  const companion = getCompanionWindow();
  const canHideOverlay = Boolean(companion && !companion.isDestroyed() && companion.isVisible());
  const excluded = getCaptureProtectionStatus().applied;
  const previousOpacity = canHideOverlay ? companion!.getOpacity() : 1;

  try {
    if (canHideOverlay && !excluded) {
      companion!.setOpacity(0);
      await sleep(80);
    }

    const display = screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    const width = Math.max(1, Math.round(display.size.width * scale));
    const height = Math.max(1, Math.round(display.size.height * scale));

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width, height },
    });

    const source =
      sources.find((s) => s.display_id && String(display.id) === s.display_id) || sources[0];

    if (!source || source.thumbnail.isEmpty()) {
      return { ok: false, error: "Could not capture the screen." };
    }

    const png = source.thumbnail.toPNG();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;

    let savedPath: string | null = null;
    if (opts?.save !== false) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const parent =
        opts?.parent && !opts.parent.isDestroyed()
          ? opts.parent
          : BrowserWindow.getFocusedWindow() ?? undefined;
      const result = parent
        ? await dialog.showSaveDialog(parent, {
            title: "Save CueAI screenshot",
            defaultPath: `cueai-screenshot-${stamp}.png`,
            filters: [{ name: "PNG Image", extensions: ["png"] }],
          })
        : await dialog.showSaveDialog({
            title: "Save CueAI screenshot",
            defaultPath: `cueai-screenshot-${stamp}.png`,
            filters: [{ name: "PNG Image", extensions: ["png"] }],
          });
      if (!result.canceled && result.filePath) {
        await fs.writeFile(result.filePath, png);
        savedPath = result.filePath;
      }
    }

    return { ok: true, dataUrl, savedPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Screenshot failed",
    };
  } finally {
    if (canHideOverlay && companion && !companion.isDestroyed()) {
      const stored = Number(getStoreValue("companionOpacity")) || previousOpacity || 1;
      companion.setOpacity(Math.min(1, Math.max(0.35, stored)));
    }
  }
}
