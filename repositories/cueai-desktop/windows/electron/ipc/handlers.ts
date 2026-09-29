import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  shell,
} from "electron";
import { IpcChannels, type CompanionMode } from "./channels";
import { getAllStore, getStoreValue, setStoreValue } from "../services/store";
import { getLicenseDevicePublic, getLicenseService } from "../services/license-service";
import {
  getCompanionWindow,
  hideCompanion,
  setCompanionMode,
  setCompanionOpacity,
  setCompanionPinned,
  showCompanion,
  toggleCompanion,
  companionUserActivity,
  expandCompanion,
  restoreCompanion,
  fitCompanionHeight,
  resetCompanionSize,
  getCompanionWindowState,
  beginOverlayResize,
  endOverlayResize,
} from "../windows/companion-window";
import {
  applyCaptureExclusion,
  getCaptureProtectionStatus,
  getMeetingSession,
  setMeetingSession,
} from "../services/screen-share";
import { getDesktopAudioSourceId } from "../services/audio-listen";
import { capturePrimaryScreenshot, listCaptureDisplays } from "../services/screenshot";
import { getWebOrigin } from "../services/web-server";

function getMainWindow() {
  return BrowserWindow.getAllWindows().find(
    (w) =>
      w.getTitle() === "CueAI" ||
      w.webContents.getURL().includes("localhost:3000") ||
      w.webContents.getURL().includes("127.0.0.1:39100") ||
      w.webContents.getURL().includes("/dashboard")
  );
}

let ipcRegistered = false;

export function registerIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle(IpcChannels.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle(IpcChannels.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  ipcMain.handle(IpcChannels.WINDOW_CLOSE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const companion = getCompanionWindow();
    if (companion && win === companion) {
      hideCompanion();
      return;
    }

    // Invoke close(); main-window "close" listener may hide-to-tray unless quitting.
    if (!win.isDestroyed()) win.close();
  });

  ipcMain.handle(IpcChannels.WINDOW_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle(IpcChannels.COMPANION_SHOW, () => showCompanion());
  ipcMain.handle(IpcChannels.COMPANION_HIDE, () => hideCompanion());
  ipcMain.handle(IpcChannels.COMPANION_TOGGLE, () => toggleCompanion());
  ipcMain.handle(IpcChannels.COMPANION_MINIMIZE, () => getCompanionWindow()?.minimize());
  ipcMain.handle(IpcChannels.COMPANION_SET_MODE, (_e, mode: CompanionMode) => {
    setCompanionMode(mode);
  });
  ipcMain.handle(IpcChannels.COMPANION_PIN, (_e, pinned: boolean) => {
    setCompanionPinned(Boolean(pinned));
  });
  ipcMain.handle(IpcChannels.COMPANION_SET_OPACITY, (_e, opacity: number) => {
    setCompanionOpacity(Number(opacity));
  });
  ipcMain.handle(IpcChannels.COMPANION_EXPAND, () => expandCompanion());
  ipcMain.handle(IpcChannels.COMPANION_RESTORE, () => restoreCompanion());
  ipcMain.handle(IpcChannels.COMPANION_RESET_SIZE, () => resetCompanionSize());
  ipcMain.handle(IpcChannels.COMPANION_FIT_HEIGHT, (_e, height: number) =>
    fitCompanionHeight(Number(height))
  );
  ipcMain.handle(IpcChannels.COMPANION_GET_WINDOW_STATE, () => getCompanionWindowState());
  ipcMain.handle(
    IpcChannels.COMPANION_BEGIN_RESIZE,
    (_e, dir: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") => beginOverlayResize(dir)
  );
  ipcMain.handle(IpcChannels.COMPANION_END_RESIZE, () => {
    endOverlayResize();
    return true;
  });
  ipcMain.handle(IpcChannels.COMPANION_TRANSCRIBE, async (_e, payload: { data: ArrayBuffer; mime: string; label: string }) => {
    const origin = getWebOrigin().replace(/\/$/, "");
    const body = new FormData();
    const mime = payload.mime || "audio/wav";
    const ext = mime.includes("wav")
      ? "wav"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("mp4")
          ? "m4a"
          : "webm";
    const blob = new Blob([Buffer.from(payload.data)], { type: mime });
    body.append("audio", blob, `listen.${ext}`);
    body.append("label", payload.label || "You");
    const res = await fetch(`${origin}/api/transcribe`, { method: "POST", body });
    const data = (await res.json()) as { text?: string; who?: string; error?: string };
    if (!res.ok) return { error: data.error || "Transcription failed" };
    return data;
  });
  ipcMain.handle(IpcChannels.COMPANION_OPEN_DASHBOARD, async () => {
    const main = getMainWindow();
    if (main) {
      main.show();
      main.focus();
      main.webContents.send("navigate", "/dashboard");
    } else {
      await shell.openExternal(`${getWebOrigin().replace(/\/$/, "")}/dashboard`);
    }
  });

  ipcMain.handle(IpcChannels.COMPANION_ACTIVITY, () => {
    companionUserActivity();
  });

  ipcMain.handle(IpcChannels.COMPANION_END_SESSION, () => {
    setMeetingSession({
      active: false,
      screenSharing: false,
      cueAiMode: "inactive",
    });
    hideCompanion();
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.show();
      main.focus();
      main.webContents.send("shortcut", "end-session");
      main.webContents.send("navigate", "/meetings/live");
    }
    return getMeetingSession();
  });

  ipcMain.handle(IpcChannels.COMPANION_GET_CAPTURE_STATUS, () => getCaptureProtectionStatus());

  ipcMain.handle(IpcChannels.COMPANION_SET_EXCLUDE_CAPTURE, (_e, enabled: boolean) => {
    const settings = getStoreValue("desktopSettings");
    setStoreValue("desktopSettings", { ...settings, excludeFromCapture: Boolean(enabled) });
    const win = getCompanionWindow();
    const status = applyCaptureExclusion(win);
    if (win && !win.isDestroyed()) {
      win.webContents.send("companion:capture-status", status);
    }
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send("companion:capture-status", status);
    }
    return status;
  });

  ipcMain.handle(IpcChannels.COMPANION_GET_LISTEN_SOURCES, () => {
    const settings = getStoreValue("desktopSettings");
    return {
      mic: Boolean(settings.listenMic),
      systemAudio: Boolean(settings.listenSystemAudio),
    };
  });

  ipcMain.handle(
    IpcChannels.COMPANION_SET_LISTEN_SOURCES,
    (_e, payload: { mic?: boolean; systemAudio?: boolean }) => {
      const settings = getStoreValue("desktopSettings");
      const next = {
        ...settings,
        listenMic:
          typeof payload?.mic === "boolean" ? payload.mic : Boolean(settings.listenMic),
        listenSystemAudio:
          typeof payload?.systemAudio === "boolean"
            ? payload.systemAudio
            : Boolean(settings.listenSystemAudio),
      };
      setStoreValue("desktopSettings", next);
      const sources = { mic: next.listenMic, systemAudio: next.listenSystemAudio };
      const win = getCompanionWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("companion:listen-sources", sources);
      }
      const main = getMainWindow();
      if (main && !main.isDestroyed()) {
        main.webContents.send("companion:listen-sources", sources);
      }
      return sources;
    }
  );

  ipcMain.handle(IpcChannels.COMPANION_GET_DESKTOP_AUDIO_SOURCE, () =>
    getDesktopAudioSourceId()
  );

  ipcMain.handle(IpcChannels.COMPANION_GET_WEB_ORIGIN, () => getWebOrigin());

  ipcMain.handle(IpcChannels.COMPANION_LIST_DISPLAYS, () => listCaptureDisplays());

  ipcMain.handle(
    IpcChannels.COMPANION_CAPTURE_SCREENSHOT,
    async (_event, payload?: { save?: boolean; displayId?: number | null }) => {
      // Capture is always in-memory. `save: true` is intentionally ignored so
      // the Screen/Capture button never opens File Explorer / Save dialogs.
      return capturePrimaryScreenshot({
        save: false,
        displayId: typeof payload?.displayId === "number" ? payload.displayId : null,
      });
    }
  );

  ipcMain.handle(
    IpcChannels.MEETING_SET_SESSION,
    (
      _e,
      payload: {
        active?: boolean;
        screenSharing?: boolean;
        meetingId?: string;
        title?: string;
        cueAiMode?: "inactive" | "private" | "live";
      }
    ) => {
      setMeetingSession(payload || {});
      return getMeetingSession();
    }
  );

  ipcMain.handle(IpcChannels.MEETING_GET_SESSION, () => getMeetingSession());

  /** Push a Screen Context / Vision answer into the companion overlay (primary UI). */
  ipcMain.handle(
    IpcChannels.COMPANION_PUSH_ANSWER,
    async (
      _e,
      payload: { answer?: string; question?: string; status?: string } | null
    ) => {
      const answer = typeof payload?.answer === "string" ? payload.answer.trim() : "";
      if (!answer) return { ok: false as const, error: "empty_answer" };
      await showCompanion();
      const companion = getCompanionWindow();
      if (companion && !companion.isDestroyed()) {
        companion.webContents.send(IpcChannels.COMPANION_PUSH_ANSWER, {
          answer,
          question:
            typeof payload?.question === "string" ? payload.question.trim() : undefined,
          status: typeof payload?.status === "string" ? payload.status : "ready",
        });
      }
      return { ok: true as const };
    }
  );

  ipcMain.handle(IpcChannels.APP_GET_VERSION, () => app.getVersion());
  ipcMain.handle(IpcChannels.APP_IS_DESKTOP, () => true);

  ipcMain.handle(IpcChannels.DESKTOP_GET_STATUS, () => {
    const companion = getCompanionWindow();
    const meeting = getMeetingSession();
    const capture = getCaptureProtectionStatus();
    return {
      isDesktop: true as const,
      version: app.getVersion(),
      companionVisible: Boolean(companion?.isVisible()),
      companionMode: getStoreValue("companionMode"),
      alwaysOnTop: getStoreValue("companionPinned"),
      launchAtStartup: getStoreValue("launchAtStartup"),
      platform: process.platform,
      captureExcluded: capture.applied,
      meetingActive: meeting.active,
      screenSharing: meeting.screenSharing,
    };
  });

  ipcMain.handle(IpcChannels.DESKTOP_OPEN_EXTERNAL, async (_e, url: string) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      throw new Error("Invalid URL");
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(
    IpcChannels.DESKTOP_SHOW_NOTIFICATION,
    (_e, payload: { title: string; body: string }) => {
      if (!getStoreValue("desktopSettings").showNotifications) return false;
      if (!Notification.isSupported()) return false;
      const n = new Notification({
        title: payload?.title || "CueAI",
        body: payload?.body || "",
      });
      n.show();
      return true;
    }
  );

  ipcMain.handle(IpcChannels.DESKTOP_PICK_FILE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openFile"],
      filters: [
        { name: "Documents", extensions: ["pdf", "doc", "docx", "txt", "md"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle(
    IpcChannels.DESKTOP_SAVE_FILE,
    async (event, payload: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: payload?.defaultPath,
        filters: payload?.filters,
      });
      return result.canceled ? null : result.filePath ?? null;
    }
  );

  ipcMain.handle(IpcChannels.STORE_GET, (_e, key: string) => {
    return getStoreValue(key as keyof ReturnType<typeof getAllStore>);
  });

  ipcMain.handle(IpcChannels.STORE_SET, (_e, key: string, value: unknown) => {
    setStoreValue(key as keyof ReturnType<typeof getAllStore>, value as never);
    if (key === "launchAtStartup") {
      app.setLoginItemSettings({ openAtLogin: Boolean(value) });
    }
    if (key === "companionPinned") {
      setCompanionPinned(Boolean(value));
    }
  });

  ipcMain.handle(IpcChannels.STORE_GET_ALL, () => getAllStore());

  ipcMain.handle(IpcChannels.LICENSE_GET_DEVICE, () => getLicenseDevicePublic());
  ipcMain.handle(IpcChannels.LICENSE_GET_STATUS, () => getLicenseService().getPublicStatus());
  ipcMain.handle(IpcChannels.LICENSE_ACTIVATE, async (_e, licenseKey: string) =>
    getLicenseService().activate(String(licenseKey || "")),
  );
  ipcMain.handle(IpcChannels.LICENSE_VALIDATE, async () => getLicenseService().validateOnline());
  ipcMain.handle(IpcChannels.LICENSE_DEACTIVATE, async () => getLicenseService().deactivate());
}
