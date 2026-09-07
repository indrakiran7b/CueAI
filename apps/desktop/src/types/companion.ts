export type CompanionMode = "full" | "mini" | "collapsed" | "presenter";

export type MeetingSession = {
  active: boolean;
  screenSharing: boolean;
  meetingId?: string;
  title?: string;
  cueAiMode?: "inactive" | "private" | "live";
};

export type CaptureStatus = {
  requested: boolean;
  applied: boolean;
  supported: boolean;
  message: string;
};

export type ListenSources = {
  mic: boolean;
  systemAudio: boolean;
};

export type ScreenshotResult = {
  ok: boolean;
  dataUrl?: string;
  savedPath?: string | null;
  error?: string;
};

export type CompanionWindowState = {
  bounds: { x: number; y: number; width: number; height: number };
  expanded: boolean;
  mode: CompanionMode;
};

export type CompanionAPI = {
  minimize: () => Promise<void>;
  hide: () => Promise<void>;
  setMode: (mode: CompanionMode) => Promise<void>;
  pin: (pinned: boolean) => Promise<void>;
  setOpacity: (opacity: number) => Promise<void>;
  openDashboard: () => Promise<void>;
  endSession: () => Promise<MeetingSession>;
  toggle: () => Promise<void>;
  activity: () => Promise<void>;
  getCaptureStatus: () => Promise<CaptureStatus>;
  setExcludeCapture: (enabled: boolean) => Promise<CaptureStatus>;
  getListenSources: () => Promise<ListenSources>;
  setListenSources: (sources: Partial<ListenSources>) => Promise<ListenSources>;
  getDesktopAudioSourceId: () => Promise<string | null>;
  getWebOrigin: () => Promise<string>;
  captureScreenshot: (opts?: { save?: boolean }) => Promise<ScreenshotResult>;
  expand: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  resetSize: () => Promise<boolean>;
  beginResize: (dir: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") => Promise<boolean>;
  endResize: () => Promise<boolean>;
  getWindowState: () => Promise<CompanionWindowState | null>;
  transcribe: (payload: { data: ArrayBuffer; mime: string; label: string }) => Promise<{
    text?: string;
    who?: string;
    error?: string;
  }>;
  getSession: () => Promise<MeetingSession>;
  onMode: (cb: (mode: CompanionMode) => void) => () => void;
  onSession: (cb: (session: MeetingSession) => void) => () => void;
  onCaptureStatus: (cb: (status: CaptureStatus) => void) => () => void;
  onListenSources: (cb: (sources: ListenSources) => void) => () => void;
  onWindowState: (cb: (state: CompanionWindowState) => void) => () => void;
};
