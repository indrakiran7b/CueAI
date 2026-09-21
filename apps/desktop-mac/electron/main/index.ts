import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { createMainWindow } from "../windows/main-window";
import {
  allowCompanionQuit,
  createCompanionWindow,
  getCompanionWindow,
  showCompanion,
} from "../windows/companion-window";
import { registerIpcHandlers } from "../ipc/handlers";
import { createTray, destroyTray } from "../tray/tray";
import { installMacAppMenu } from "../menu/app-menu";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "../services/shortcuts";
import { initUpdater } from "../updater/updater";
import { getStoreValue } from "../services/store";
import { startLocalBridge, stopLocalBridge } from "../services/local-bridge";
import { startQwenVlSidecar, stopQwenVlSidecar } from "../services/qwen-vl-sidecar";
import { registerMediaPermissionHandler } from "../services/audio-listen";
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
import { applyMacAppearance, focusOrRestoreWindow } from "../platform/macos";

app.setName("CueAI");
app.setPath("userData", path.join(app.getPath("appData"), "CueAI-Mac"));
if (process.env.CUEAI_CDP) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.CUEAI_CDP);
}
applyMacAppearance();

let mainWindow: BrowserWindow | null = null;

function getMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

function focusOrShowMain() {
  focusOrRestoreWindow(getMainWindow());
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
    console.log("[ELECTRON] Starting Electron");
    try {
      await startEmbeddedWebServer();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start the embedded web UI.";
      console.error("[WEB] Failed to start");
      console.error("[WEB] Reason:", message);
      if (app.isPackaged) {
        dialog.showErrorBox("CueAI failed to start", message);
        app.quit();
        return;
      }
      // Development: keep Electron open so Retry can load the workspace once Next is up.
    }

    registerIpcHandlers();
    registerMediaPermissionHandler();
    startLocalBridge();
    startQwenVlSidecar();
    installMacAppMenu(getMainWindow);
    mainWindow = createMainWindow();

    mainWindow.on("maximize", () => {
      mainWindow?.webContents.send("window:maximized-changed", true);
    });
    mainWindow.on("unmaximize", () => {
      mainWindow?.webContents.send("window:maximized-changed", false);
    });

    // Overlay is created lazily on first show (OverlayWindowManager.ensureOverlayWindow).

    createTray(getMainWindow);
    registerGlobalShortcuts(getMainWindow);
    initUpdater();

    if (getStoreValue("launchAtStartup")) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    if (process.env.CUEAI_SHOW_OVERLAY === "1") {
      void showCompanion();
    }

    // Handle protocol URL that launched this process (Windows).
    const launchUrl = extractProtocolUrl(process.argv);
    if (launchUrl) {
      handleProtocolUrl(launchUrl);
    }

    app.on("activate", () => {
      const existing = getMainWindow();
      if (existing) {
        focusOrRestoreWindow(existing);
        return;
      }
      mainWindow = createMainWindow();
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
    stopQwenVlSidecar();
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
