import { session, systemPreferences } from "electron";
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
}

/** macOS desktop source id for system-audio capture. Null when unauthorized. */
export async function getDesktopAudioSourceId(): Promise<string | null> {
  if (process.platform === "darwin") {
    return macOSSystemAudio.getDesktopAudioSourceId();
  }
  return null;
}
