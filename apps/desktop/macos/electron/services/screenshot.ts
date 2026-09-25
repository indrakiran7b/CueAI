import { BrowserWindow, dialog } from "electron";
import fs from "node:fs/promises";
import { captureMacDisplay } from "../platform/macos";

export type ScreenshotResult = {
  ok: boolean;
  dataUrl?: string;
  savedPath?: string | null;
  error?: string;
  displayId?: number;
};

/**
 * Capture a physical Mac display.
 * CueAI windows are hidden for the capture so the overlay / Screen Context
 * page is not recursively included. No file picker unless save is requested.
 */
export async function capturePrimaryScreenshot(opts?: {
  save?: boolean;
  parent?: BrowserWindow | null;
  displayId?: number;
}): Promise<ScreenshotResult> {
  const shot = await captureMacDisplay({
    displayId: opts?.displayId,
    hideCueAi: true,
  });
  if (!shot.ok || !shot.dataUrl) return shot;

  let savedPath: string | null = null;
  if (opts?.save === true) {
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
      const raw = shot.dataUrl.replace(/^data:image\/png;base64,/, "");
      await fs.writeFile(result.filePath, Buffer.from(raw, "base64"));
      savedPath = result.filePath;
    }
  }

  return { ...shot, savedPath };
}
