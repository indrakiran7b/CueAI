/**
 * Screen-sharing awareness for the CueAI Companion.
 * Uses only documented Electron / OS APIs (setContentProtection).
 * Degrades gracefully when exclusion is unsupported.
 */

import { BrowserWindow, screen } from "electron";
import { getStoreValue, setStoreValue } from "./store";
import type { CompanionMode } from "../ipc/channels";

export type MeetingSessionState = {
  active: boolean;
  screenSharing: boolean;
  meetingId?: string;
  title?: string;
  /** CueAI assistant mode — independent of meeting active state. */
  cueAiMode?: "inactive" | "private" | "live";
};

export type CaptureProtectionStatus = {
  requested: boolean;
  applied: boolean;
  supported: boolean;
  message: string;
};

let session: MeetingSessionState = {
  active: false,
  screenSharing: false,
  cueAiMode: "inactive",
};

let lastModeBeforePresent: CompanionMode = "full";
let protectionStatus: CaptureProtectionStatus = {
  requested: true,
  applied: false,
  supported: false,
  message: "Not applied yet",
};

type CompanionController = {
  getWindow: () => BrowserWindow | null;
  setMode: (mode: CompanionMode) => void;
  setOpacity: (opacity: number) => void;
  show: () => void;
  hide: () => void;
  dockPresenter: () => void;
};

let controller: CompanionController | null = null;

export function bindScreenShareController(c: CompanionController) {
  controller = c;
}

export function getMeetingSession(): MeetingSessionState {
  return { ...session };
}

export function getCaptureProtectionStatus(): CaptureProtectionStatus {
  return { ...protectionStatus };
}

/**
 * Prefer excluding the companion from common window-capture pipelines.
 * Electron maps this to SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) on
 * Windows 10 2004+ / Windows 11, and NSWindowSharingNone on macOS.
 * Some meeting apps may still capture the window — degrade gracefully.
 */
export function applyCaptureExclusion(win: BrowserWindow | null): CaptureProtectionStatus {
  if (!win || win.isDestroyed()) {
    protectionStatus = {
      requested: true,
      applied: false,
      supported: false,
      message: "Companion window unavailable",
    };
    return getCaptureProtectionStatus();
  }

  const enabled = getStoreValue("desktopSettings").excludeFromCapture !== false;
  if (!enabled) {
    try {
      win.setContentProtection(false);
    } catch {
      // ignore
    }
    protectionStatus = {
      requested: false,
      applied: false,
      supported: true,
      message: "Capture exclusion disabled in settings",
    };
    return getCaptureProtectionStatus();
  }

  try {
    // Work around known Electron opacity + content-protection interactions.
    const current = win.getOpacity();
    win.setOpacity(Math.min(1, Math.max(0.5, current || 0.96)));

    win.setContentProtection(true);

    const applied =
      typeof win.isContentProtected === "function" ? win.isContentProtected() : true;

    protectionStatus = {
      requested: true,
      applied,
      supported: applied,
      message: applied
        ? "Excluded from common capture pipelines when the OS supports it"
        : "Content protection requested; OS may not fully exclude this window",
    };
  } catch (err) {
    protectionStatus = {
      requested: true,
      applied: false,
      supported: false,
      message:
        err instanceof Error
          ? `Capture exclusion unavailable: ${err.message}`
          : "Capture exclusion unavailable on this platform",
    };
  }

  return getCaptureProtectionStatus();
}

export function setMeetingSession(next: Partial<MeetingSessionState>) {
  const prev = { ...session };
  session = {
    ...session,
    ...next,
    active: next.active !== undefined ? Boolean(next.active) : session.active,
    screenSharing:
      next.screenSharing !== undefined ? Boolean(next.screenSharing) : session.screenSharing,
    cueAiMode: next.cueAiMode ?? session.cueAiMode ?? "inactive",
  };

  if (!session.active) {
    session.cueAiMode = "inactive";
  }

  const cueAiOn =
    session.active && (session.cueAiMode === "private" || session.cueAiMode === "live");
  const prevCueAiOn =
    prev.active && (prev.cueAiMode === "private" || prev.cueAiMode === "live");

  // Turning CueAI on → full companion popout (same idea as Ctrl+Shift+Space).
  // Presenter dock is only for active screen-share, not every Private/Live toggle.
  if (cueAiOn && !prevCueAiOn) {
    if (session.screenSharing) {
      enterPresentationForShare();
    } else {
      controller?.show();
    }
  }

  if (cueAiOn && session.screenSharing && !prev.screenSharing) {
    enterPresentationForShare();
  }

  if (cueAiOn && !session.screenSharing && prev.screenSharing) {
    exitPresentationForShare();
  }

  if ((!cueAiOn && prevCueAiOn) || (!session.active && prev.active)) {
    if (prev.screenSharing || getStoreValue("companionMode") === "presenter") {
      exitPresentationForShare();
    }
    controller?.hide();
  }

  const win = controller?.getWindow();
  win?.webContents.send("companion:session", getMeetingSession());
  win?.webContents.send("companion:capture-status", getCaptureProtectionStatus());

  return getMeetingSession();
}

function enterPresentationForShare() {
  if (!controller) return;
  const current = getStoreValue("companionMode");
  if (current !== "presenter") {
    lastModeBeforePresent = current;
    setStoreValue("companionModeBeforeShare", current);
  }
  controller.setMode("presenter");
  controller.setOpacity(1);
  controller.dockPresenter();
  controller.show();
}

function exitPresentationForShare() {
  if (!controller) return;
  const restore =
    getStoreValue("companionModeBeforeShare") || lastModeBeforePresent || "full";
  controller.setMode(restore);
  controller.setOpacity(getStoreValue("companionOpacity"));
}

/** Snap presenter window to the nearest vertical edge of its current display. */
export function dockPresenterToEdge(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;
  const width = 360;
  const height = 220;
  const midX = bounds.x + bounds.width / 2;
  const dockRight = midX >= wa.x + wa.width / 2;
  const x = dockRight ? wa.x + wa.width - width - 16 : wa.x + 16;
  const y = Math.min(
    Math.max(wa.y + 48, bounds.y),
    wa.y + wa.height - height - 16
  );
  win.setBounds({ x, y, width, height }, true);
}

/** Keep saved bounds on a visible display (multi-monitor safe). */
export function clampBoundsToVisibleDisplay(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const displays = screen.getAllDisplays();
  const overlaps = displays.some((d) => {
    const a = d.workArea;
    return (
      bounds.x + bounds.width > a.x &&
      bounds.x < a.x + a.width &&
      bounds.y + bounds.height > a.y &&
      bounds.y < a.y + a.height
    );
  });
  if (overlaps) return bounds;
  const primary = screen.getPrimaryDisplay().workArea;
  return {
    width: bounds.width,
    height: bounds.height,
    x: primary.x + primary.width - bounds.width - 24,
    y: primary.y + Math.round(primary.height * 0.12),
  };
}
