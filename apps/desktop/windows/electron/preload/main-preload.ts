import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels, type CompanionMode, type DesktopStatus } from "../ipc/channels";

export type CueDesktopAPI = {
  isDesktop: true;
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
  onNavigate: (cb: (path: string) => void) => () => void;
  onShortcut: (cb: (name: string) => void) => () => void;
  toggleCompanion: () => Promise<void>;
  showCompanion: () => Promise<void>;
  hideCompanion: () => Promise<void>;
  getStatus: () => Promise<DesktopStatus>;
  getVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  notify: (title: string, body: string) => Promise<boolean>;
  pickFile: () => Promise<string | null>;
  saveFile: (opts?: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  storeGet: <T = unknown>(key: string) => Promise<T>;
  storeSet: (key: string, value: unknown) => Promise<void>;
  storeGetAll: () => Promise<Record<string, unknown>>;
};

const api: CueDesktopAPI = {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke(IpcChannels.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(IpcChannels.WINDOW_MAXIMIZE),
  close: () => ipcRenderer.invoke(IpcChannels.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IpcChannels.WINDOW_IS_MAXIMIZED),
  onMaximizedChange: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized);
    ipcRenderer.on(IpcChannels.WINDOW_MAXIMIZED_CHANGED, listener);
    return () => ipcRenderer.removeListener(IpcChannels.WINDOW_MAXIMIZED_CHANGED, listener);
  },
  onNavigate: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, path: string) => cb(path);
    ipcRenderer.on("navigate", listener);
    return () => ipcRenderer.removeListener("navigate", listener);
  },
  onShortcut: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, name: string) => cb(name);
    ipcRenderer.on("shortcut", listener);
    return () => ipcRenderer.removeListener("shortcut", listener);
  },
  toggleCompanion: () => ipcRenderer.invoke(IpcChannels.COMPANION_TOGGLE),
  showCompanion: () => ipcRenderer.invoke(IpcChannels.COMPANION_SHOW),
  hideCompanion: () => ipcRenderer.invoke(IpcChannels.COMPANION_HIDE),
  getStatus: () => ipcRenderer.invoke(IpcChannels.DESKTOP_GET_STATUS),
  getVersion: () => ipcRenderer.invoke(IpcChannels.APP_GET_VERSION),
  openExternal: (url) => ipcRenderer.invoke(IpcChannels.DESKTOP_OPEN_EXTERNAL, url),
  notify: (title, body) =>
    ipcRenderer.invoke(IpcChannels.DESKTOP_SHOW_NOTIFICATION, { title, body }),
  pickFile: () => ipcRenderer.invoke(IpcChannels.DESKTOP_PICK_FILE),
  saveFile: (opts) => ipcRenderer.invoke(IpcChannels.DESKTOP_SAVE_FILE, opts),
  storeGet: (key) => ipcRenderer.invoke(IpcChannels.STORE_GET, key),
  storeSet: (key, value) => ipcRenderer.invoke(IpcChannels.STORE_SET, key, value),
  storeGetAll: () => ipcRenderer.invoke(IpcChannels.STORE_GET_ALL),
};

contextBridge.exposeInMainWorld("cueDesktop", api);

export type { CompanionMode };
