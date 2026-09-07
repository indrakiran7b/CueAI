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
