import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels, type CompanionMode } from "../ipc/channels";
import type { CaptureStatus, CompanionAPI, MeetingSession } from "../../src/types/companion";

const api: CompanionAPI = {
  minimize: () => ipcRenderer.invoke(IpcChannels.COMPANION_MINIMIZE),
  hide: () => ipcRenderer.invoke(IpcChannels.COMPANION_HIDE),
  setMode: (mode: CompanionMode) => ipcRenderer.invoke(IpcChannels.COMPANION_SET_MODE, mode),
  pin: (pinned) => ipcRenderer.invoke(IpcChannels.COMPANION_PIN, pinned),
  setOpacity: (opacity) => ipcRenderer.invoke(IpcChannels.COMPANION_SET_OPACITY, opacity),
  openDashboard: () => ipcRenderer.invoke(IpcChannels.COMPANION_OPEN_DASHBOARD),
  endSession: () => ipcRenderer.invoke(IpcChannels.COMPANION_END_SESSION),
  toggle: () => ipcRenderer.invoke(IpcChannels.COMPANION_TOGGLE),
  activity: () => ipcRenderer.invoke(IpcChannels.COMPANION_ACTIVITY),
  getCaptureStatus: () =>
    ipcRenderer.invoke(IpcChannels.COMPANION_GET_CAPTURE_STATUS) as Promise<CaptureStatus>,
  setExcludeCapture: (enabled) =>
    ipcRenderer.invoke(IpcChannels.COMPANION_SET_EXCLUDE_CAPTURE, enabled) as Promise<CaptureStatus>,
  getSession: () =>
    ipcRenderer.invoke(IpcChannels.MEETING_GET_SESSION) as Promise<MeetingSession>,
  onMode: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, mode: CompanionMode) => cb(mode);
    ipcRenderer.on("companion:mode", listener);
    return () => ipcRenderer.removeListener("companion:mode", listener);
  },
  onSession: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, session: MeetingSession) => cb(session);
    ipcRenderer.on("companion:session", listener);
    return () => ipcRenderer.removeListener("companion:session", listener);
  },
  onCaptureStatus: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, status: CaptureStatus) => cb(status);
    ipcRenderer.on("companion:capture-status", listener);
    return () => ipcRenderer.removeListener("companion:capture-status", listener);
  },
};

contextBridge.exposeInMainWorld("cueai", api);
