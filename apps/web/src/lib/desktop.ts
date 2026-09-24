export type DesktopStatus = {
  isDesktop: true;
  version: string;
  companionVisible: boolean;
  companionMode: "full" | "mini" | "collapsed" | "presenter";
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
  platform: string;
  captureExcluded?: boolean;
  meetingActive?: boolean;
  screenSharing?: boolean;
};

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

export type ScreenshotResult = {
  ok: boolean;
  dataUrl?: string;
  savedPath?: string | null;
  error?: string;
  displayId?: number;
  meta?: {
    width: number;
    height: number;
    bytes: number;
    displayId: number;
    displayLabel?: string;
    sourceName?: string;
  };
};

export type MacPermissionState =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "unknown";

export type MacPermissionStatus = {
  state: MacPermissionState;
  message: string;
};

export type MacPermissionsSnapshot = {
  microphone: MacPermissionStatus;
  screenRecording: MacPermissionStatus;
  systemAudio: MacPermissionStatus;
};

export type CaptureDisplay = {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea?: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  primary: boolean;
  internal?: boolean;
};

export type MacDisplayInfo = CaptureDisplay;

export type CueDesktopAPI = {
  isDesktop: true;
  isMac?: boolean;
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
  onNavigate: (cb: (path: string) => void) => () => void;
  onShortcut: (cb: (name: string) => void) => () => void;
  toggleCompanion: () => Promise<void>;
  showCompanion: () => Promise<CompanionOpenResult | CompanionBridgeStatus | void>;
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
  setMeetingSession: (session: Partial<MeetingSession>) => Promise<MeetingSession>;
  getMeetingSession: () => Promise<MeetingSession>;
  getCaptureStatus: () => Promise<CaptureStatus>;
  setExcludeCapture?: (enabled: boolean) => Promise<CaptureStatus>;
  getListenSources?: () => Promise<{ mic: boolean; systemAudio: boolean }>;
  setListenSources?: (sources: Partial<{ mic: boolean; systemAudio: boolean }>) => Promise<{
    mic: boolean;
    systemAudio: boolean;
  }>;
  endSession?: () => Promise<MeetingSession>;
  onCaptureStatus?: (cb: (status: CaptureStatus) => void) => () => void;
  onListenSources?: (cb: (sources: { mic: boolean; systemAudio: boolean }) => void) => () => void;
  captureScreenshot?: (opts?: {
    save?: boolean;
    displayId?: number | null;
  }) => Promise<ScreenshotResult>;
  listDisplays?: () => Promise<CaptureDisplay[]>;
  listWindows?: () => Promise<{ id: string; name: string; displayId?: string }[]>;
  pushCompanionAnswer?: (payload: {
    answer: string;
    question?: string;
    status?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  getPermissions?: () => Promise<MacPermissionsSnapshot>;
  requestPermission?: (
    kind: "microphone" | "screen" | "systemAudio"
  ) => Promise<MacPermissionStatus>;
  openPrivacySettings?: (
    pane?: "microphone" | "screen" | "systemAudio" | "privacy"
  ) => Promise<boolean>;
  getMacDevice?: () => Promise<{
    deviceId: string;
    maskedId: string;
    deviceName: string;
    platform: "macos";
    appVersion: string;
    keychainAvailable: boolean;
    hasCredential?: boolean;
  }>;
  registerMacDevice?: () => Promise<{
    ok: boolean;
    status: "NEW" | "PENDING" | "ACTIVE" | "BLOCKED" | "REVOKED" | "NETWORK_ERROR" | "SERVER_ERROR" | "AUTH_REQUIRED";
    authorized: boolean;
    httpStatus?: number;
    message?: string;
  }>;
  verifyMacDevice?: () => Promise<{
    ok: boolean;
    status: "NEW" | "PENDING" | "ACTIVE" | "BLOCKED" | "REVOKED" | "NETWORK_ERROR" | "SERVER_ERROR" | "AUTH_REQUIRED";
    authorized: boolean;
    httpStatus?: number;
    message?: string;
  }>;
  clearMacDeviceSession?: () => Promise<{
    cleared: boolean;
    identityPreserved: boolean;
  }>;
  getLicenseDevice?: () => Promise<{
    deviceId: string;
    maskedId: string;
    deviceName: string;
    platform: "windows" | "macos";
    appVersion: string;
    secureStorageAvailable: boolean;
  }>;
  getLicenseStatus?: () => Promise<LicenseStatusPayload>;
  activateLicense?: (licenseKey: string) => Promise<LicenseStatusPayload>;
  validateLicense?: () => Promise<LicenseStatusPayload>;
  deactivateLicense?: () => Promise<LicenseStatusPayload>;
};

export type LicenseStatusPayload = {
  ok: boolean;
  state:
    | "ACTIVE"
    | "EXPIRED"
    | "REVOKED"
    | "INVALID"
    | "DEVICE_LIMIT_REACHED"
    | "NOT_ACTIVATED"
    | "NETWORK_ERROR";
  authorized: boolean;
  message?: string;
  clientName?: string;
  licenseType?: string;
  expiresAt?: string;
  devicesActive?: number;
  maxDevices?: number;
  licenseId?: string;
  deviceId?: string;
  platform?: "windows" | "macos";
};

declare global {
  interface Window {
    cueDesktop?: CueDesktopAPI;
  }
}

/** Loopback bridge exposed by CueAI Desktop (Electron). */
export const DESKTOP_BRIDGE_URL = "http://127.0.0.1:39291";

/** Deep link to wake Desktop and open the system-wide companion. */
export const DESKTOP_PROTOCOL_COMPANION = "cueai://companion";

export type CompanionOpenResult = {
  /** native = Electron overlay; web = in-page fallback; launching = protocol fired */
  mode: "native" | "web" | "launching";
  /** Set when Desktop responded but the overlay window did not become visible. */
  issue?: "not_visible" | "load_error";
  loadError?: string | null;
};

export function isDesktopApp() {
  return typeof window !== "undefined" && Boolean(window.cueDesktop?.isDesktop);
}

export function isMacDesktopApp() {
  if (typeof window === "undefined") return false;
  if (window.cueDesktop?.isMac) return true;
  if (document.documentElement.dataset.desktop === "mac") return true;
  return new URLSearchParams(window.location.search).get("desktop") === "mac";
}

export function getDesktop() {
  return typeof window !== "undefined" ? window.cueDesktop : undefined;
}

async function bridgeFetch(path: string, init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(`${DESKTOP_BRIDGE_URL}${path}`, {
      ...init,
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

type CompanionBridgeStatus = {
  ok?: boolean;
  visible?: boolean;
  loadError?: string | null;
};

async function bridgeFetchJson<T extends Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<T | null> {
  try {
    const res = await fetch(`${DESKTOP_BRIDGE_URL}${path}`, {
      ...init,
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function waitForCompanionVisible(timeoutMs = 4000): Promise<CompanionBridgeStatus | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await bridgeFetchJson<CompanionBridgeStatus>("/companion/status", {
      method: "GET",
    });
    if (status?.visible) return status;
    await sleep(150);
  }
  return bridgeFetchJson<CompanionBridgeStatus>("/companion/status", { method: "GET" });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** True when the Electron desktop app is reachable (in-process or via local bridge). */
export async function isDesktopAvailable() {
  if (isDesktopApp()) return true;
  return bridgeFetch("/health", { method: "GET" });
}

/**
 * Attempt to launch / focus CueAI Desktop via the cueai:// protocol.
 * Returns true if the protocol navigation was attempted (OS may still prompt).
 */
export function tryLaunchDesktopApp(path = "companion"): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = `cueai://${path.replace(/^\/+/, "")}`;
    // Hidden iframe avoids navigating away from the current SPA route.
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 2000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the companion overlay — prefers native Desktop (always-on-top + capture exclude).
 * Falls back to the in-page web companion when Desktop is unavailable.
 */
function nativeResultFromBridge(status: CompanionBridgeStatus | null): CompanionOpenResult | null {
  if (!status) return null;
  if (status.visible) {
    return status.loadError
      ? { mode: "native", issue: "load_error", loadError: status.loadError }
      : { mode: "native" };
  }
  if (status.loadError) {
    return { mode: "native", issue: "load_error", loadError: status.loadError };
  }
  return null;
}

export async function openCompanionOverlay(): Promise<CompanionOpenResult> {
  const desktop = getDesktop();
  if (desktop) {
    try {
      const shown = (await desktop.showCompanion()) as CompanionBridgeStatus | void;
      const immediate = nativeResultFromBridge(shown || null);
      if (immediate) return immediate;

      for (let i = 0; i < 20; i++) {
        const status = await desktop.getStatus();
        if (status.companionVisible) return { mode: "native" };
        await sleep(150);
      }
      // Never talk to :39291 from inside Electron — another app may own that port.
    } catch (err) {
      return {
        mode: "native",
        issue: "load_error",
        loadError: err instanceof Error ? err.message : "Companion IPC failed",
      };
    }
    return { mode: "native", issue: "not_visible" };
  }

  if (await bridgeFetch("/companion/show", { method: "POST", body: "{}" })) {
    const status = await waitForCompanionVisible(5000);
    if (status?.visible) {
      return status.loadError
        ? { mode: "native", issue: "load_error", loadError: status.loadError }
        : { mode: "native" };
    }
    return {
      mode: "native",
      issue: status?.loadError ? "load_error" : "not_visible",
      loadError: status?.loadError ?? null,
    };
  }

  // Desktop installed but not running — try deep link, then re-check bridge briefly.
  if (tryLaunchDesktopApp("companion")) {
    for (let i = 0; i < 6; i++) {
      await sleep(400);
      if (await bridgeFetch("/companion/show", { method: "POST", body: "{}" })) {
        const status = await waitForCompanionVisible();
        if (status?.visible) return { mode: "native" };
      }
    }
    return { mode: "launching" };
  }

  const { dispatchWebCompanion } = await import(
    "@/components/companion/web-companion-provider"
  );
  dispatchWebCompanion("open");
  return { mode: "web" };
}

/** Toggle companion — native bridge first, then limited web fallback. */
export async function toggleCompanionOverlay(): Promise<CompanionOpenResult> {
  const desktop = getDesktop();
  if (desktop) {
    await desktop.toggleCompanion();
    return { mode: "native" };
  }

  if (await bridgeFetch("/companion/toggle", { method: "POST", body: "{}" })) {
    return { mode: "native" };
  }

  if (tryLaunchDesktopApp("companion/toggle")) {
    for (let i = 0; i < 6; i++) {
      await sleep(400);
      if (await bridgeFetch("/companion/toggle", { method: "POST", body: "{}" })) {
        return { mode: "native" };
      }
    }
    return { mode: "launching" };
  }

  const { dispatchWebCompanion } = await import(
    "@/components/companion/web-companion-provider"
  );
  dispatchWebCompanion("toggle");
  return { mode: "web" };
}

export async function hideCompanionOverlay(): Promise<CompanionOpenResult> {
  const desktop = getDesktop();
  if (desktop) {
    await desktop.hideCompanion();
    return { mode: "native" };
  }
  if (await bridgeFetch("/companion/hide", { method: "POST", body: "{}" })) {
    return { mode: "native" };
  }

  const { dispatchWebCompanion } = await import(
    "@/components/companion/web-companion-provider"
  );
  dispatchWebCompanion("close");
  return { mode: "web" };
}

export async function startDesktopMeetingSession(
  session: Partial<MeetingSession> & { showCompanion?: boolean; hideCompanion?: boolean }
) {
  const desktop = getDesktop();
  if (desktop) {
    const next = await desktop.setMeetingSession(session);
    if (session.showCompanion === true) {
      await desktop.showCompanion();
    }
    if (session.hideCompanion === true) {
      await desktop.hideCompanion();
    }
    return next;
  }

  const ok = await bridgeFetch("/meeting/session", {
    method: "POST",
    body: JSON.stringify(session),
  });
  if (ok) return session;

  // Desktop may be installed but not running — wake it when we need the overlay.
  if (session.showCompanion === true && tryLaunchDesktopApp("companion")) {
    for (let i = 0; i < 6; i++) {
      await sleep(400);
      const retried = await bridgeFetch("/meeting/session", {
        method: "POST",
        body: JSON.stringify(session),
      });
      if (retried) return session;
    }
  }

  // Browser fallback — keep the in-page companion in sync with live meeting state.
  const { dispatchWebCompanion, dispatchWebCompanionSession } = await import(
    "@/components/companion/web-companion-provider"
  );
  dispatchWebCompanionSession(session);
  if (session.showCompanion === true) dispatchWebCompanion("open");
  if (session.hideCompanion === true) dispatchWebCompanion("close");
  return session;
}

export type CompanionAnswerPayload = {
  answer: string;
  question?: string;
  status?: string;
};

/**
 * Push a Screen Context answer into the Desktop Companion (primary UI).
 * Falls back to the in-page web companion when Desktop is unavailable.
 */
export async function pushCompanionAnswer(
  payload: CompanionAnswerPayload
): Promise<"native" | "web" | "failed"> {
  const answer = payload.answer?.trim();
  if (!answer) return "failed";
  const body = {
    answer,
    question: payload.question?.trim() || undefined,
    status: payload.status || "ready",
  };

  const desktop = getDesktop();
  if (desktop?.pushCompanionAnswer) {
    await desktop.showCompanion();
    const result = await desktop.pushCompanionAnswer(body);
    return result?.ok ? "native" : "failed";
  }

  if (
    await bridgeFetch("/companion/answer", {
      method: "POST",
      body: JSON.stringify(body),
    })
  ) {
    return "native";
  }

  const { dispatchWebCompanion, dispatchWebCompanionAnswer } = await import(
    "@/components/companion/web-companion-provider"
  );
  dispatchWebCompanion("open");
  dispatchWebCompanionAnswer(body);
  return "web";
}

/** List physical monitors from CueAI Desktop (IPC or loopback bridge). */
export async function listDesktopDisplays(): Promise<CaptureDisplay[]> {
  const desktop = getDesktop();
  if (desktop?.listDisplays) {
    try {
      const displays = await desktop.listDisplays();
      if (Array.isArray(displays) && displays.length) return displays;
    } catch {
      /* fall through to bridge */
    }
  }

  const payload = await bridgeFetchJson<{ ok?: boolean; displays?: CaptureDisplay[] }>(
    "/displays",
    { method: "GET" }
  );
  return Array.isArray(payload?.displays) ? payload.displays : [];
}

/**
 * Capture a physical display via CueAI Desktop native capture.
 * Never uses getDisplayMedia / html2canvas / BrowserWindow capture.
 */
export async function captureDesktopScreenshot(opts?: {
  displayId?: number | null;
}): Promise<ScreenshotResult> {
  const desktop = getDesktop();
  if (desktop?.captureScreenshot) {
    return desktop.captureScreenshot({
      save: false,
      displayId: opts?.displayId ?? null,
    });
  }

  const payload = await bridgeFetchJson<ScreenshotResult & { ok?: boolean }>(
    "/screenshot",
    {
      method: "POST",
      body: JSON.stringify({ displayId: opts?.displayId ?? null }),
    }
  );

  if (!payload) {
    return {
      ok: false,
      error:
        "CueAI Desktop is required to capture your screen. Open CueAI Desktop and try again.",
    };
  }

  return {
    ok: Boolean(payload.ok && payload.dataUrl),
    dataUrl: payload.dataUrl,
    error: payload.error,
    meta: payload.meta,
  };
}
