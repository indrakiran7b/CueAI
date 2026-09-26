import { Menu, Tray, nativeImage, app, BrowserWindow } from "electron";
import { showCompanion, toggleCompanion } from "../windows/companion-window";

let tray: Tray | null = null;

function trayIcon() {
  // 16x16 teal circle as fallback bitmap
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const i = (y * size + x) * 4;
      const inside = dx * dx + dy * dy <= 36;
      canvas[i] = inside ? 20 : 0;
      canvas[i + 1] = inside ? 184 : 0;
      canvas[i + 2] = inside ? 166 : 0;
      canvas[i + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function createTray(getMainWindow: () => BrowserWindow | null) {
  if (tray) return tray;

  tray = new Tray(trayIcon());
  tray.setToolTip("CueAI");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show CueAI",
      click: () => {
        const win = getMainWindow();
        win?.show();
        win?.focus();
      },
    },
    {
      label: "Hide CueAI",
      click: () => getMainWindow()?.hide(),
    },
    { type: "separator" },
    {
      label: "Open Companion",
      click: () => showCompanion(),
    },
    {
      label: "Toggle Companion",
      accelerator: "CommandOrControl+Shift+Space",
      click: () => toggleCompanion(),
    },
    { type: "separator" },
    {
      label: "Start Meeting",
      click: () => {
        const win = getMainWindow();
        win?.show();
        win?.webContents.send("navigate", "/meetings/live");
      },
    },
    {
      label: "Settings",
      click: () => {
        const win = getMainWindow();
        win?.show();
        win?.webContents.send("navigate", "/settings");
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    const win = getMainWindow();
    win?.show();
    win?.focus();
  });

  return tray;
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
