import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels, type CompanionMode, type DesktopStatus } from "../ipc/channels";

type MeetingSession = {
  active: boolean;
  screenSharing: boolean;
  meetingId?: string;
  title?: string;
  cueAiMode?: "inactive" | "private" | "live";
};

type CaptureStatus = {
  requested: boolean;
  applied: boolean;
  supported: boolean;
  message: string;
};

type ListenSources = {
  mic: boolean;
  systemAudio: boolean;
};

/** Main window API — CueAI shell (Next.js). */
const cueDesktop = {
  isDesktop: true as const,
  minimize: () => ipcRenderer.invoke(IpcChannels.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(IpcChannels.WINDOW_MAXIMIZE),
  close: () => ipcRenderer.invoke(IpcChannels.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IpcChannels.WINDOW_IS_MAXIMIZED),
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const listener = (_: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized);
    ipcRenderer.on(IpcChannels.WINDOW_MAXIMIZED_CHANGED, listener);
    return () => ipcRenderer.removeListener(IpcChannels.WINDOW_MAXIMIZED_CHANGED, listener);
  },
  onNavigate: (cb: (path: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, path: string) => cb(path);
    ipcRenderer.on("navigate", listener);
    return () => ipcRenderer.removeListener("navigate", listener);
  },
  onShortcut: (cb: (name: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, name: string) => cb(name);
    ipcRenderer.on("shortcut", listener);
    return () => ipcRenderer.removeListener("shortcut", listener);
  },
  toggleCompanion: () => ipcRenderer.invoke(IpcChannels.COMPANION_TOGGLE),
  showCompanion: () => ipcRenderer.invoke(IpcChannels.COMPANION_SHOW),
  hideCompanion: () => ipcRenderer.invoke(IpcChannels.COMPANION_HIDE),
  getStatus: (): Promise<DesktopStatus> => ipcRenderer.invoke(IpcChannels.DESKTOP_GET_STATUS),
  getVersion: () => ipcRenderer.invoke(IpcChannels.APP_GET_VERSION),
  openExternal: (url: string) => ipcRenderer.invoke(IpcChannels.DESKTOP_OPEN_EXTERNAL, url),
  notify: (title: string, body: string) =>
    ipcRenderer.invoke(IpcChannels.DESKTOP_SHOW_NOTIFICATION, { title, body }),
  pickFile: () => ipcRenderer.invoke(IpcChannels.DESKTOP_PICK_FILE),
  saveFile: (opts?: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => ipcRenderer.invoke(IpcChannels.DESKTOP_SAVE_FILE, opts),
  storeGet: <T = unknown>(key: string) => ipcRenderer.invoke(IpcChannels.STORE_GET, key) as Promise<T>,
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke(IpcChannels.STORE_SET, key, value),
  storeGetAll: () => ipcRenderer.invoke(IpcChannels.STORE_GET_ALL),
  setMeetingSession: (session: Partial<MeetingSession>) =>
    ipcRenderer.invoke(IpcChannels.MEETING_SET_SESSION, session) as Promise<MeetingSession>,
  getMeetingSession: () =>
    ipcRenderer.invoke(IpcChannels.MEETING_GET_SESSION) as Promise<MeetingSession>,
  getCaptureStatus: () =>
    ipcRenderer.invoke(IpcChannels.COMPANION_GET_CAPTURE_STATUS) as Promise<CaptureStatus>,
  captureScreenshot: (opts?: { save?: boolean }) =>
    ipcRenderer.invoke(IpcChannels.COMPANION_CAPTURE_SCREENSHOT, opts) as Promise<{
      ok: boolean;
      dataUrl?: string;
      savedPath?: string | null;
      error?: string;
    }>,
};

/** Companion overlay API. */
const cueai = {
  minimize: () => ipcRenderer.invoke(IpcChannels.COMPANION_MINIMIZE),
  hide: () => ipcRenderer.invoke(IpcChannels.COMPANION_HIDE),
  setMode: (mode: CompanionMode) => ipcRenderer.invoke(IpcChannels.COMPANION_SET_MODE, mode),
  pin: (pinned: boolean) => ipcRenderer.invoke(IpcChannels.COMPANION_PIN, pinned),
  setOpacity: (opacity: number) => ipcRenderer.invoke(IpcChannels.COMPANION_SET_OPACITY, opacity),
  openDashboard: () => ipcRenderer.invoke(IpcChannels.COMPANION_OPEN_DASHBOARD),
  endSession: () => ipcRenderer.invoke(IpcChannels.COMPANION_END_SESSION),
  toggle: () => ipcRenderer.invoke(IpcChannels.COMPANION_TOGGLE),
  activity: () => ipcRenderer.invoke(IpcChannels.COMPANION_ACTIVITY),
  getCaptureStatus: () =>
    ipcRenderer.invoke(IpcChannels.COMPANION_GET_CAPTURE_STATUS) as Promise<CaptureStatus>,
  setExcludeCapture: (enabled: boolean) =>
    ipcRenderer.invoke(IpcChannels.COMPANION_SET_EXCLUDE_CAPTURE, enabled) as Promise<CaptureStatus>,
  getListenSources: () =>
    ipcRenderer.invoke(IpcChannels.COMPANION_GET_LISTEN_SOURCES) as Promise<ListenSources>,
  setListenSources: (sources: Partial<ListenSources>) =>
    ipcRenderer.invoke(IpcChannels.COMPANION_SET_LISTEN_SOURCES, sources) as Promise<ListenSources>,
  getDesktopAudioSourceId: () =>
    ipcRenderer.invoke(IpcChannels.COMPANION_GET_DESKTOP_AUDIO_SOURCE) as Promise<string | null>,
  getWebOrigin: () =>
    ipcRenderer.invoke(IpcChannels.COMPANION_GET_WEB_ORIGIN) as Promise<string>,
  captureScreenshot: (opts?: { save?: boolean }) =>
    ipcRenderer.invoke(IpcChannels.COMPANION_CAPTURE_SCREENSHOT, opts) as Promise<{
      ok: boolean;
      dataUrl?: string;
      savedPath?: string | null;
      error?: string;
    }>,
  beginResize: (dir: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") =>
    ipcRenderer.invoke(IpcChannels.COMPANION_BEGIN_RESIZE, dir) as Promise<boolean>,
  endResize: () => ipcRenderer.invoke(IpcChannels.COMPANION_END_RESIZE) as Promise<boolean>,
  expand: () => ipcRenderer.invoke(IpcChannels.COMPANION_EXPAND) as Promise<boolean>,
  restore: () => ipcRenderer.invoke(IpcChannels.COMPANION_RESTORE) as Promise<boolean>,
  resetSize: () => ipcRenderer.invoke(IpcChannels.COMPANION_RESET_SIZE) as Promise<boolean>,
  getWindowState: () =>
    ipcRenderer.invoke(IpcChannels.COMPANION_GET_WINDOW_STATE) as Promise<{
      bounds: { x: number; y: number; width: number; height: number };
      expanded: boolean;
      mode: CompanionMode;
    } | null>,
  transcribe: (payload: { data: ArrayBuffer; mime: string; label: string }) =>
    ipcRenderer.invoke(IpcChannels.COMPANION_TRANSCRIBE, payload) as Promise<{
      text?: string;
      who?: string;
      error?: string;
    }>,
  getSession: () =>
    ipcRenderer.invoke(IpcChannels.MEETING_GET_SESSION) as Promise<MeetingSession>,
  onMode: (cb: (mode: CompanionMode) => void) => {
    const listener = (_: Electron.IpcRendererEvent, mode: CompanionMode) => cb(mode);
    ipcRenderer.on("companion:mode", listener);
    return () => ipcRenderer.removeListener("companion:mode", listener);
  },
  onSession: (cb: (session: MeetingSession) => void) => {
    const listener = (_: Electron.IpcRendererEvent, s: MeetingSession) => cb(s);
    ipcRenderer.on("companion:session", listener);
    return () => ipcRenderer.removeListener("companion:session", listener);
  },
  onCaptureStatus: (cb: (status: CaptureStatus) => void) => {
    const listener = (_: Electron.IpcRendererEvent, s: CaptureStatus) => cb(s);
    ipcRenderer.on("companion:capture-status", listener);
    return () => ipcRenderer.removeListener("companion:capture-status", listener);
  },
  onListenSources: (cb: (sources: ListenSources) => void) => {
    const listener = (_: Electron.IpcRendererEvent, s: ListenSources) => cb(s);
    ipcRenderer.on("companion:listen-sources", listener);
    return () => ipcRenderer.removeListener("companion:listen-sources", listener);
  },
  onWindowState: (
    cb: (state: {
      bounds: { x: number; y: number; width: number; height: number };
      expanded: boolean;
      mode: CompanionMode;
    }) => void
  ) => {
    const listener = (_: Electron.IpcRendererEvent, s: typeof cb extends (v: infer V) => void ? V : never) =>
      cb(s);
    ipcRenderer.on("companion:window-state", listener);
    return () => ipcRenderer.removeListener("companion:window-state", listener);
  },
};

contextBridge.exposeInMainWorld("cueDesktop", cueDesktop);
contextBridge.exposeInMainWorld("cueai", cueai);
