// Shared IPC channel names — keep in sync with preload & web bridge
export const IpcChannels = {
  // Window controls (main app)
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_MAXIMIZE: "window:maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_IS_MAXIMIZED: "window:is-maximized",
  WINDOW_MAXIMIZED_CHANGED: "window:maximized-changed",

  // Companion
  COMPANION_SHOW: "companion:show",
  COMPANION_HIDE: "companion:hide",
  COMPANION_TOGGLE: "companion:toggle",
  COMPANION_SET_MODE: "companion:set-mode",
  COMPANION_MINIMIZE: "companion:minimize",
  COMPANION_PIN: "companion:pin",
  COMPANION_SET_OPACITY: "companion:set-opacity",
  COMPANION_OPEN_DASHBOARD: "companion:open-dashboard",
  COMPANION_ACTIVITY: "companion:activity",
  COMPANION_GET_CAPTURE_STATUS: "companion:get-capture-status",
  COMPANION_SET_EXCLUDE_CAPTURE: "companion:set-exclude-capture",
  COMPANION_GET_LISTEN_SOURCES: "companion:get-listen-sources",
  COMPANION_SET_LISTEN_SOURCES: "companion:set-listen-sources",
  COMPANION_GET_DESKTOP_AUDIO_SOURCE: "companion:get-desktop-audio-source",
  COMPANION_GET_WEB_ORIGIN: "companion:get-web-origin",
  COMPANION_CAPTURE_SCREENSHOT: "companion:capture-screenshot",
  COMPANION_END_SESSION: "companion:end-session",
  COMPANION_EXPAND: "companion:expand",
  COMPANION_RESTORE: "companion:restore",
  COMPANION_RESET_SIZE: "companion:reset-size",
  COMPANION_GET_WINDOW_STATE: "companion:get-window-state",
  COMPANION_TRANSCRIBE: "companion:transcribe",
  COMPANION_BEGIN_RESIZE: "companion:begin-resize",
  COMPANION_END_RESIZE: "companion:end-resize",

  // Meeting / screen-share session
  MEETING_SET_SESSION: "meeting:set-session",
  MEETING_GET_SESSION: "meeting:get-session",

  // App / desktop
  APP_GET_VERSION: "app:get-version",
  APP_IS_DESKTOP: "app:is-desktop",
  DESKTOP_GET_STATUS: "desktop:get-status",
  DESKTOP_OPEN_EXTERNAL: "desktop:open-external",
  DESKTOP_SHOW_NOTIFICATION: "desktop:show-notification",
  DESKTOP_PICK_FILE: "desktop:pick-file",
  DESKTOP_SAVE_FILE: "desktop:save-file",

  // Settings / store
  STORE_GET: "store:get",
  STORE_SET: "store:set",
  STORE_GET_ALL: "store:get-all",
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export type CompanionMode = "full" | "mini" | "collapsed" | "presenter";

export type DesktopStatus = {
  isDesktop: true;
  version: string;
  companionVisible: boolean;
  companionMode: CompanionMode;
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
  platform: NodeJS.Platform;
  captureExcluded: boolean;
  meetingActive: boolean;
  screenSharing: boolean;
};

export type CueStoreSchema = {
  theme: "dark" | "light";
  workspace: string;
  mainBounds: { x: number; y: number; width: number; height: number } | null;
  companionBounds: { x: number; y: number; width: number; height: number } | null;
  companionMode: CompanionMode;
  companionModeBeforeShare: CompanionMode | null;
  companionOpacity: number;
  companionPinned: boolean;
  companionExpanded: boolean;
  companionNormalBounds: { x: number; y: number; width: number; height: number } | null;
  launchAtStartup: boolean;
  recentMeetings: string[];
  pinnedAnswers: string[];
  desktopSettings: {
    minimizeToTray: boolean;
    showNotifications: boolean;
    globalShortcuts: boolean;
    excludeFromCapture: boolean;
    listenMic: boolean;
    listenSystemAudio: boolean;
    autoPresentOnMeeting: boolean;
    autoHide: boolean;
    autoHideMs: number;
    autoCollapse: boolean;
    autoCollapseMs: number;
    presenterOpacity: number;
  };
};

export type ListenSources = {
  mic: boolean;
  systemAudio: boolean;
};
