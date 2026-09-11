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
};

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
  setMeetingSession: (session: Partial<MeetingSession>) => Promise<MeetingSession>;
  getMeetingSession: () => Promise<MeetingSession>;
  getCaptureStatus: () => Promise<CaptureStatus>;
  setExcludeCapture?: (enabled: boolean) => Promise<CaptureStatus>;
  captureScreenshot?: (opts?: { save?: boolean }) => Promise<ScreenshotResult>;
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
export async function openCompanionOverlay(): Promise<CompanionOpenResult> {
  const desktop = getDesktop();
  if (desktop) {
    await desktop.showCompanion();
    for (let i = 0; i < 8; i++) {
      const status = await desktop.getStatus();
      if (status.companionVisible) return { mode: "native" };
      await sleep(150);
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
