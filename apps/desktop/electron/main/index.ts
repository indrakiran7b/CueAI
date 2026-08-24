import { app, BrowserWindow, dialog } from "electron";
import { createMainWindow } from "../windows/main-window";
import {
  allowCompanionQuit,
  createCompanionWindow,
  getCompanionWindow,
  showCompanion,
} from "../windows/companion-window";
import { registerIpcHandlers } from "../ipc/handlers";
import { createTray, destroyTray } from "../tray/tray";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "../services/shortcuts";
import { initUpdater } from "../updater/updater";
import { getStoreValue } from "../services/store";
import { startLocalBridge, stopLocalBridge } from "../services/local-bridge";
import {
  startEmbeddedWebServer,
  stopEmbeddedWebServer,
} from "../services/web-server";
import { markAppQuitting } from "../services/app-lifecycle";
import { getMeetingSession } from "../services/screen-share";
import {
  extractProtocolUrl,
  handleProtocolUrl,
  registerCueaiProtocolClient,
} from "../services/protocol";

let mainWindow: BrowserWindow | null = null;

function getMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

function focusOrShowMain() {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Register before ready so Windows can resolve cueai:// launches.
  registerCueaiProtocolClient();

  app.on("second-instance", (_event, argv) => {
    const protocolUrl = extractProtocolUrl(argv);
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl);
      return;
    }
    // Cold second launch without protocol — show main shell.
    focusOrShowMain();
  });

  // macOS deep links
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.whenReady().then(async () => {
    try {
      await startEmbeddedWebServer();
    } catch (err) {
      dialog.showErrorBox(
        "CueAI failed to start",
        err instanceof Error ? err.message : "Could not start the embedded web UI."
      );
      app.quit();
      return;
    }

    registerIpcHandlers();
    startLocalBridge();
    mainWindow = createMainWindow();

    mainWindow.on("maximize", () => {
      mainWindow?.webContents.send("window:maximized-changed", true);
    });
    mainWindow.on("unmaximize", () => {
      mainWindow?.webContents.send("window:maximized-changed", false);
    });

    createCompanionWindow();

    createTray(getMainWindow);
    registerGlobalShortcuts(getMainWindow);
    initUpdater();

    if (getStoreValue("launchAtStartup")) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    // Handle protocol URL that launched this process (Windows).
    const launchUrl = extractProtocolUrl(process.argv);
    if (launchUrl) {
      handleProtocolUrl(launchUrl);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      } else {
        getMainWindow()?.show();
      }
    });
  });

  app.on("before-quit", () => {
    markAppQuitting();
    allowCompanionQuit();
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners("close");
    }
  });

  app.on("will-quit", () => {
    unregisterGlobalShortcuts();
    destroyTray();
    stopLocalBridge();
    stopEmbeddedWebServer();
  });

  app.on("window-all-closed", () => {
    if (process.platform === "darwin") return;

    // Tray + companion own process lifetime. Do not quit just because the
    // main shell was hidden — overlay must survive until End Session / Close / Quit.
    const session = getMeetingSession();
    const companion = getCompanionWindow();
    if (session.active || companion?.isVisible() || getStoreValue("desktopSettings").minimizeToTray) {
      if (session.active && (!companion || companion.isDestroyed())) {
        createCompanionWindow();
        showCompanion();
      }
      return;
    }

    // No tray preference and no live overlay — allow normal Windows quit.
    app.quit();
  });
}

export { getMainWindow };
