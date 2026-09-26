import { Menu, Tray, nativeImage, app, BrowserWindow } from "electron";
import { showCompanion, toggleCompanion, hideCompanion } from "../windows/companion-window";

let tray: Tray | null = null;

function menuBarIcon() {
  const size = 18;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 8.5;
      const dy = y - 8.5;
      const i = (y * size + x) * 4;
      const ring = Math.abs(Math.sqrt(dx * dx + dy * dy) - 6.2) < 1.15;
      const core = dx * dx + dy * dy <= 4.5;
      const on = ring || core;
      canvas[i] = 255;
      canvas[i + 1] = 255;
      canvas[i + 2] = 255;
      canvas[i + 3] = on ? 230 : 0;
    }
  }
  const image = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  image.setTemplateImage(true);
  return image;
}

export function createTray(getMainWindow: () => BrowserWindow | null) {
  if (tray) return tray;

  tray = new Tray(menuBarIcon());
  tray.setToolTip("CueAI");
  tray.setIgnoreDoubleClickEvents(true);

  const popup = () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: "Show Companion", accelerator: "Command+Shift+Space", click: () => showCompanion() },
      { label: "Hide Companion", click: () => hideCompanion() },
      { type: "separator" },
      {
        label: "Open CueAI",
        click: () => {
          const win = getMainWindow();
          win?.show();
          win?.focus();
        },
      },
      {
        label: "New Session…",
        click: () => {
          const win = getMainWindow();
          win?.show();
          win?.webContents.send("navigate", "/meetings/live");
        },
      },
      { type: "separator" },
      { label: "Quit CueAI", accelerator: "Command+Q", click: () => app.quit() },
    ]);
    tray?.popUpContextMenu(contextMenu);
  };

  tray.on("click", popup);
  tray.on("right-click", popup);

  return tray;
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
