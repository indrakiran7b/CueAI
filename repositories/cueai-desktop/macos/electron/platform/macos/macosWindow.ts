import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron";

export function applyMacAppearance() {
  if (process.platform !== "darwin") return;
  nativeTheme.themeSource = "system";
}

export function macMainWindowOptions(
  extra: BrowserWindowConstructorOptions = {}
): BrowserWindowConstructorOptions {
  const isMac = process.platform === "darwin";
  return {
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 13 },
          vibrancy: "under-window" as const,
          visualEffectState: "active" as const,
        }
      : { frame: false }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#090909" : "#f8fafc",
    roundedCorners: true,
    hasShadow: true,
    fullscreenable: true,
    ...extra,
  };
}

export function macCompanionWindowOptions(
  extra: BrowserWindowConstructorOptions = {}
): BrowserWindowConstructorOptions {
  const isMac = process.platform === "darwin";
  return {
    frame: false,
    transparent: isMac,
    ...(isMac
      ? {
          vibrancy: "hud" as const,
          visualEffectState: "active" as const,
          backgroundColor: "#00000000",
          hiddenInMissionControl: true,
        }
      : { backgroundColor: "#1c1c1e" }),
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    focusable: true,
    fullscreenable: false,
    acceptFirstMouse: true,
    ...extra,
  };
}

export async function presentCompanionWindow(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();

  win.setOpacity(1);
  win.setSkipTaskbar(true);
  win.setFocusable(true);
  win.setIgnoreMouseEvents(false);
  win.setAlwaysOnTop(true, "screen-saver", 1);
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  win.show();
  if (!win.isVisible()) {
    win.showInactive();
    win.show();
  }
  win.moveTop();
  win.focus();
  win.webContents.setBackgroundThrottling(false);

  for (let i = 0; i < 12 && !win.isDestroyed() && !win.isVisible(); i++) {
    await new Promise((r) => setTimeout(r, 50));
    win.show();
    win.moveTop();
  }

  return !win.isDestroyed() && win.isVisible();
}

export function focusOrRestoreWindow(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  return true;
}

export function zoomOrRestoreWindow(win: BrowserWindow) {
  if (win.isFullScreen()) {
    win.setFullScreen(false);
    return false;
  }
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return win.isMaximized();
}
