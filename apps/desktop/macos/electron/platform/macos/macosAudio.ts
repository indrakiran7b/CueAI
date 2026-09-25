import { desktopCapturer, screen } from "electron";
import {
  checkSystemAudioPermission,
  requestScreenRecordingPermission,
  type MacPermissionStatus,
} from "./macosPermissions";

export type SystemAudioAvailability = {
  available: boolean;
  sourceId: string | null;
  permission: MacPermissionStatus;
  message: string;
};

/**
 * macOS system-audio capture is not Windows loopback.
 * Chromium/Electron uses desktop capture (ScreenCaptureKit on supported OS versions).
 * Availability here only means "we may attempt capture" — connected requires audio tracks.
 */
export class MacOSSystemAudioService {
  async getPermissionStatus(): Promise<MacPermissionStatus> {
    return checkSystemAudioPermission();
  }

  async isSystemAudioAvailable(): Promise<boolean> {
    const result = await this.probe();
    return result.available;
  }

  async startSystemAudio(): Promise<SystemAudioAvailability> {
    return this.probe({ requestIfNeeded: true });
  }

  async stopSystemAudio(): Promise<void> {
    // Capture lifetime is owned by the renderer MediaStream.
  }

  async getDesktopAudioSourceId(): Promise<string | null> {
    const result = await this.probe({ requestIfNeeded: true });
    return result.sourceId;
  }

  private async probe(opts?: { requestIfNeeded?: boolean }): Promise<SystemAudioAvailability> {
    let permission = checkSystemAudioPermission();

    if (opts?.requestIfNeeded && permission.state === "not-determined") {
      await requestScreenRecordingPermission();
      permission = checkSystemAudioPermission();
    }

    if (permission.state === "denied" || permission.state === "restricted") {
      return {
        available: false,
        sourceId: null,
        permission,
        message: permission.message,
      };
    }

    if (permission.state !== "granted" && permission.state !== "not-determined") {
      return {
        available: false,
        sourceId: null,
        permission,
        message: permission.message,
      };
    }

    try {
      const primary = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });
      permission = checkSystemAudioPermission();

      if (permission.state === "denied" || permission.state === "restricted") {
        return {
          available: false,
          sourceId: null,
          permission,
          message: permission.message,
        };
      }

      const matched =
        sources.find((s) => s.display_id && String(primary.id) === String(s.display_id)) ||
        sources[0];

      if (!matched?.id) {
        console.log("[Audio] No display source for system audio");
        return {
          available: false,
          sourceId: null,
          permission,
          message:
            "No display source is available for system-audio capture. Grant Screen Recording and try again.",
        };
      }

      console.log("[Audio] Permission =", permission.state);
      return {
        available: permission.state === "granted",
        sourceId: matched.id,
        permission,
        message:
          permission.state === "granted"
            ? "Screen Recording is allowed. CueAI will report system audio as connected only after audio tracks start."
            : permission.message,
      };
    } catch (err) {
      permission = checkSystemAudioPermission();
      return {
        available: false,
        sourceId: null,
        permission,
        message:
          err instanceof Error
            ? err.message
            : "System audio capture is unavailable on this Mac.",
      };
    }
  }
}

export const macOSSystemAudio = new MacOSSystemAudioService();
