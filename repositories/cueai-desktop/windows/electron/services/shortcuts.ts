import { globalShortcut, BrowserWindow } from "electron";
import { getStoreValue } from "../services/store";
import { toggleCompanion } from "../windows/companion-window";

export function registerGlobalShortcuts(getMainWindow: () => BrowserWindow | null) {
  if (!getStoreValue("desktopSettings").globalShortcuts) return;

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    toggleCompanion();
  });

  globalShortcut.register("CommandOrControl+K", () => {
    const win = getMainWindow();
    win?.show();
    win?.focus();
    win?.webContents.send("shortcut", "command-palette");
  });

  globalShortcut.register("CommandOrControl+Shift+T", () => {
    const win = getMainWindow();
    win?.show();
    win?.webContents.send("navigate", "/meetings/live");
    win?.webContents.send("shortcut", "start-transcription");
  });

  globalShortcut.register("CommandOrControl+Shift+M", () => {
    const win = getMainWindow();
    win?.show();
    win?.webContents.send("navigate", "/meetings/live");
  });

  globalShortcut.register("CommandOrControl+Shift+S", () => {
    const win = getMainWindow();
    win?.show();
    win?.webContents.send("navigate", "/meetings/summary");
    win?.webContents.send("shortcut", "generate-summary");
  });

  // Esc is handled on the companion window (before-input-event) so it does not
  // steal Escape from the main CueAI UI / web forms.

  // Ctrl+Shift+C — toggle companion (legacy alias)
  globalShortcut.register("CommandOrControl+Shift+C", () => {
    toggleCompanion();
  });
}

export function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll();
}
