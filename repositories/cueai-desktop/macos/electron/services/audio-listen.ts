import { desktopCapturer, screen, session, systemPreferences } from "electron";
import { macOSSystemAudio } from "../platform/macos";

export type ListenSources = {
  mic: boolean;
  systemAudio: boolean;
};

function isCapturePermission(permission: string) {
  return (
    permission === "media" ||
    permission === "mediaKeySystem" ||
    permission === "display-capture" ||
    permission === "audioCapture" ||
    permission === "microphone"
  );
}

async function allowMacMicrophone(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  try {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    console.log("[Audio] Microphone permission:", status);
    if (status === "granted") return true;
    if (status === "denied" || status === "restricted") return false;
    if (status === "not-determined") {
      return systemPreferences.askForMediaAccess("microphone");
    }
    return true;
  } catch {
    return true;
  }
}

/** Allow mic / display-capture prompts from the companion renderer. */
export function registerMediaPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const p = permission as string;
    if (!isCapturePermission(p)) {
      callback(false);
      return;
    }

    if (p === "display-capture") {
      callback(true);
      return;
    }

    const mediaTypes =
      details && "mediaTypes" in details && Array.isArray(details.mediaTypes)
        ? details.mediaTypes
        : [];
    const looksLikeDesktopOrCamera = mediaTypes.includes("video");
    if (process.platform === "darwin" && !looksLikeDesktopOrCamera && (p === "media" || p === "microphone" || p === "audioCapture")) {
      void allowMacMicrophone().then((ok) => callback(ok));
      return;
    }

    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return isCapturePermission(permission as string);
  });

  // macOS 13+ system audio via ScreenCaptureKit loopback (same API as Windows).
  try {
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const primary = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 1, height: 1 },
        });
        const matched =
          sources.find((s) => s.display_id && String(primary.id) === String(s.display_id)) ||
          sources.find((s) => s.id === `screen:${primary.id}:0`) ||
          sources[0];
        if (!matched) {
          callback({});
          return;
        }
        callback({ video: matched, audio: "loopback" });
      } catch (err) {
        console.error("[AUDIO] displayMedia handler failed", err);
        callback({});
      }
    });
  } catch (err) {
    console.error("[AUDIO] setDisplayMediaRequestHandler unavailable", err);
  }
}

/** macOS desktop source id for system-audio capture. Null when unauthorized. */
export async function getDesktopAudioSourceId(): Promise<string | null> {
  if (process.platform === "darwin") {
    return macOSSystemAudio.getDesktopAudioSourceId();
  }
  return null;
}
