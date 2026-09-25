import type { BrowserWindow } from "electron";

export type OverlayCaptureProtectionStatus = {
  requested: boolean;
  applied: boolean;
  supported: boolean;
  message: string;
};

/**
 * macOS content protection uses Electron setContentProtection → NSWindowSharingNone.
 * This is not SetWindowDisplayAffinity / WDA_EXCLUDEFROMCAPTURE.
 * ScreenCaptureKit-based capture paths may still see the window.
 */
export function setOverlayCaptureProtection(
  win: BrowserWindow | null,
  enabled: boolean
): OverlayCaptureProtectionStatus {
  if (!win || win.isDestroyed()) {
    return {
      requested: enabled,
      applied: false,
      supported: false,
      message: "Companion window unavailable",
    };
  }

  if (!enabled) {
    try {
      win.setContentProtection(false);
    } catch {
      // ignore
    }
    return {
      requested: false,
      applied: false,
      supported: true,
      message: "Overlay capture protection is off. The companion may appear in recordings.",
    };
  }

  try {
    const current = win.getOpacity();
    if (current < 0.5) {
      win.setOpacity(Math.min(1, Math.max(0.5, current || 0.96)));
    }

    win.setContentProtection(true);
    const applied =
      typeof win.isContentProtected === "function" ? win.isContentProtected() : true;

    return {
      requested: true,
      applied,
      supported: applied,
      message: applied
        ? "Content protection is on (NSWindowSharingNone). Some ScreenCaptureKit capture paths may still see this window."
        : "Content protection was requested, but macOS did not confirm it is active.",
    };
  } catch (err) {
    return {
      requested: true,
      applied: false,
      supported: false,
      message:
        err instanceof Error
          ? `macOS content protection unavailable: ${err.message}`
          : "macOS content protection is unavailable.",
    };
  }
}
