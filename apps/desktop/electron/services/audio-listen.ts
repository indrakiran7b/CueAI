import { desktopCapturer, session } from "electron";

export type ListenSources = {
  mic: boolean;
  systemAudio: boolean;
};

/** Allow mic / display-capture prompts from the companion renderer. */
export function registerMediaPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const ok =
      permission === "media" ||
      permission === "mediaKeySystem" ||
      permission === "display-capture" ||
      // Electron/Chromium variants
      (permission as string) === "audioCapture" ||
      (permission as string) === "microphone";
    console.log("[PERM] request", permission, "granted", ok);
    callback(ok);
  });

  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    const p = permission as string;
    return (
      p === "media" ||
      p === "mediaKeySystem" ||
      p === "display-capture" ||
      p === "audioCapture" ||
      p === "microphone"
    );
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    // Audio capture is governed by the media permission handlers above; HID/serial/USB stay denied.
    console.log("[PERM] device", details.deviceType, "granted", false);
    return false;
  });

  // Prefer silent Windows loopback for getDisplayMedia (Teams/Zoom/browser audio).
  try {
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const screens = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 1, height: 1 },
        });
        const primary = screens[0];
        if (!primary) {
          callback({});
          return;
        }
        callback({ video: primary, audio: "loopback" });
      } catch (err) {
        console.error("[AUDIO] displayMedia handler failed", err);
        callback({});
      }
    });
  } catch (err) {
    console.error("[AUDIO] setDisplayMediaRequestHandler unavailable", err);
  }
}

/** Primary screen/desktop source id for system-audio loopback capture. */
export async function getDesktopAudioSourceId(): Promise<string | null> {
  const screens = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 },
  });
  if (screens[0]?.id) return screens[0].id;

  const windows = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 1, height: 1 },
  });
  return windows[0]?.id ?? null;
}
