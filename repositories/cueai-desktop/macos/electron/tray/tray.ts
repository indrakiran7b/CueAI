import { Menu, Tray, nativeImage, app, BrowserWindow } from "electron";
import { showCompanion, toggleCompanion, hideCompanion } from "../windows/companion-window";

let tray: Tray | null = null;

const MENU_BAR_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAAfUlEQVR42u3YQRKAIAwEQf7/6fgGYxYdma3KyQPNQQhZyxhj0qmbhYG+Cq+hwkC3wCtcKOw4GgWuzYXCPkZPLhIHdxbofh9BT2G76Ag4tbkouPNDCRYs+CQw6ljDXRyfuppxzQ+yvcQ18L7p/vRydpCCHFVhh4HIcasx5oRc17QZEgQMEXoAAAAASUVORK5CYII=";

function menuBarIcon() {
  const image = nativeImage.createFromDataURL(MENU_BAR_ICON);
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
      { label: "Show Overlay", accelerator: "Command+Shift+Space", click: () => showCompanion() },
      { label: "Hide Overlay", click: () => hideCompanion() },
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
