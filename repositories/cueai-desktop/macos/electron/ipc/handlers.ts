import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  shell,
} from "electron";
import {
  IpcChannels,
  OVERLAY_TRANSPARENCY_MIN,
  isValidTransparency,
  type CompanionMode,
} from "./channels";
import { getAllStore, getStoreValue, setStoreValue } from "../services/store";
import {
  getCompanionBridgeStatus,
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
import { capturePrimaryScreenshot } from "../services/screenshot";
import { getWebOrigin } from "../services/web-server";
import { startMacGoogleSignIn } from "../services/google-oauth";

import { allowNextWindowClose } from "../services/app-lifecycle";
import {
  getMacOSPermissions,
  listMacDisplays,
  listMacWindows,
  openMacOSPrivacySettings,
  requestMacOSPermission,
  zoomOrRestoreWindow,
  macDeviceService,
  type MacPermissionKind,
} from "../platform/macos";

function getMainWindow() {
  const origin = getWebOrigin().replace(/\/$/, "");
  return BrowserWindow.getAllWindows().find((w) => {
    const url = w.webContents.getURL();
    return (
      w.getTitle() === "CueAI" ||
      (origin && url.startsWith(origin)) ||
      url.includes("127.0.0.1:39100") ||
      url.includes("/login") ||
      url.includes("/dashboard")
    );
  });
}

const TRANSCRIBE_TIMEOUT_MS = 15_000;

let deviceAuthEnsuredAt = 0;
const DEVICE_AUTH_ENSURE_MS = 30_000;

// Overlay requests carry no cookie, so they authenticate with the device credential.
// Failures return whatever headers exist; they never block the app.
async function ensureDeviceAuthHeaders(): Promise<Record<string, string>> {
  const now = Date.now();
  let headers = macDeviceService.getAuthHeaders();
  if (
    now - deviceAuthEnsuredAt < DEVICE_AUTH_ENSURE_MS &&
    headers["X-CueAI-Device-Id"] &&
    headers["X-CueAI-Device-Credential"]
  ) {
    return headers;
  }
  const main = getMainWindow();
  if (!main || main.isDestroyed()) return headers;
  const ses = main.webContents.session;
  const origin = getWebOrigin();
  const fetchImpl = (input: string, init?: RequestInit) => ses.fetch(input, init);
  try {
    const verified = await macDeviceService.verifyDevice(fetchImpl, origin);
    if (
      verified.ok &&
      verified.authorized &&
      headers["X-CueAI-Device-Id"] &&
      headers["X-CueAI-Device-Credential"]
    ) {
      deviceAuthEnsuredAt = now;
      return headers;
    }
    if (verified.status === "BLOCKED" || verified.status === "REVOKED") return headers;
    await macDeviceService.registerDevice(fetchImpl, origin);
  } catch (err) {
    console.log("[DEVICE] credential refresh skipped", err instanceof Error ? err.message : err);
    return headers;
  }
  headers = macDeviceService.getAuthHeaders();
  if (headers["X-CueAI-Device-Id"] && headers["X-CueAI-Device-Credential"]) {
    deviceAuthEnsuredAt = Date.now();
  }
  return headers;
}

function saveListenSources(payload: { mic?: boolean; systemAudio?: boolean }) {
  const settings = getStoreValue("desktopSettings");
  const next = {
    ...settings,
    listenMic: typeof payload?.mic === "boolean" ? payload.mic : Boolean(settings.listenMic),
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

let ipcRegistered = false;

export function registerIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;
  // Capture must be switched on explicitly in each session, never resumed silently at launch.
  saveListenSources({ mic: false, systemAudio: false });
  ipcMain.handle(IpcChannels.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle(IpcChannels.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (process.platform === "darwin") return zoomOrRestoreWindow(win);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  ipcMain.handle(IpcChannels.WINDOW_RESTORE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
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

    allowNextWindowClose();
    if (!win.isDestroyed()) win.close();
  });

  ipcMain.handle(IpcChannels.WINDOW_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle(IpcChannels.COMPANION_SHOW, async () => {
    if (!app.isPackaged) console.log("[COMPANION] IPC received");
    await showCompanion();
    return getCompanionBridgeStatus();
  });
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
  ipcMain.handle(IpcChannels.COMPANION_GET_TRANSPARENCY, () => {
    const saved = getStoreValue("companionTransparency");
    return isValidTransparency(saved) ? saved : OVERLAY_TRANSPARENCY_MIN;
  });
  ipcMain.handle(IpcChannels.COMPANION_SET_TRANSPARENCY, (_e, value: unknown) => {
    if (!isValidTransparency(value)) throw new Error("Transparency must be a whole number from 0 to 80.");
    setStoreValue("companionTransparency", value);
    return value;
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
  ipcMain.handle(
    IpcChannels.COMPANION_TRANSCRIBE,
    async (_e, payload: {
      data: ArrayBuffer;
      mime: string;
      label: string;
      prompt?: string;
      workflow?: "interview";
    }) => {
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
      if (payload.workflow === "interview") body.append("workflow", "interview");
      if (payload.prompt?.trim()) body.append("prompt", payload.prompt.trim().slice(-400));
      let res: Response;
      try {
        res = await fetch(`${origin}/api/transcribe`, {
          method: "POST",
          headers: await ensureDeviceAuthHeaders(),
          body,
          signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          error: timedOut ? "Transcription timed out." : "Unable to reach the transcription service.",
          status: timedOut ? 504 : 0,
        };
      }
      const retryAfter = Number(res.headers.get("retry-after")) || undefined;
      let data: { text?: string; who?: string; error?: string; uncertain?: boolean } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        if (res.ok) return { error: "Transcription returned an unreadable response.", status: 502 };
      }
      if (!res.ok) return { error: data.error || "Transcription failed", status: res.status, retryAfter };
      return { text: data.text, who: data.who, uncertain: Boolean(data.uncertain), status: res.status };
    }
  );
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
    saveListenSources({ mic: false, systemAudio: false });
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
    (_e, payload: { mic?: boolean; systemAudio?: boolean }) => saveListenSources(payload)
  );

  ipcMain.handle(IpcChannels.COMPANION_GET_DESKTOP_AUDIO_SOURCE, () =>
    getDesktopAudioSourceId()
  );

  ipcMain.handle(IpcChannels.COMPANION_GET_WEB_ORIGIN, () => getWebOrigin());

  ipcMain.handle(
    IpcChannels.COMPANION_CAPTURE_SCREENSHOT,
    async (event, payload?: { save?: boolean; displayId?: number }) => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      return capturePrimaryScreenshot({
        save: payload?.save === true,
        displayId: payload?.displayId,
        parent,
      });
    }
  );

  ipcMain.handle(IpcChannels.DESKTOP_LIST_DISPLAYS, () => listMacDisplays());
  ipcMain.handle(IpcChannels.DESKTOP_LIST_WINDOWS, () => listMacWindows());
  ipcMain.handle(IpcChannels.PERMISSIONS_GET, () => getMacOSPermissions());
  ipcMain.handle(
    IpcChannels.PERMISSIONS_REQUEST,
    (_e, kind: MacPermissionKind) => requestMacOSPermission(kind)
  );
  ipcMain.handle(IpcChannels.PERMISSIONS_OPEN_SETTINGS, (_e, pane?: MacPermissionKind | "privacy") =>
    openMacOSPrivacySettings(pane || "privacy")
  );
  ipcMain.handle(IpcChannels.DEVICE_GET_AUTH_HEADERS, () => ensureDeviceAuthHeaders());
  ipcMain.handle(IpcChannels.AUTH_GOOGLE_START, () =>
    startMacGoogleSignIn(() => getMainWindow() ?? null),
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

  ipcMain.handle(IpcChannels.APP_GET_VERSION, () => app.getVersion());
  ipcMain.handle(IpcChannels.APP_IS_DESKTOP, () => true);

  ipcMain.handle(IpcChannels.DESKTOP_GET_STATUS, () => {
    const companion = getCompanionWindow();
    const meeting = getMeetingSession();
    const capture = getCaptureProtectionStatus();
    const overlay = getCompanionBridgeStatus();
    return {
      isDesktop: true as const,
      version: app.getVersion(),
      companionVisible: Boolean(overlay.visible || companion?.isVisible()),
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
    if (typeof url !== "string") throw new Error("Invalid URL");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Invalid URL");
    }
    const host = parsed.hostname.toLowerCase();
    const stripeHost = host === "stripe.com" || host.endsWith(".stripe.com");
    const localDev = host === "127.0.0.1" || host === "localhost";
    if (stripeHost && parsed.protocol !== "https:") {
      throw new Error("Stripe checkout must use HTTPS");
    }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localDev)) {
      throw new Error("Invalid URL");
    }
    await shell.openExternal(parsed.toString());
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
}
