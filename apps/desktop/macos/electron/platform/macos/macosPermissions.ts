import { desktopCapturer, shell, systemPreferences } from "electron";

export type MacPermissionState =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "unknown";

export type MacPermissionKind = "microphone" | "screen" | "systemAudio";

export type MacPermissionStatus = {
  state: MacPermissionState;
  message: string;
};

export type MacPermissionsSnapshot = {
  microphone: MacPermissionStatus;
  screenRecording: MacPermissionStatus;
  systemAudio: MacPermissionStatus;
};

const PRIVACY_URLS: Record<MacPermissionKind | "privacy", string> = {
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  systemAudio: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  privacy: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension",
};

function mapStatus(raw: string | undefined): MacPermissionState {
  switch (raw) {
    case "granted":
    case "denied":
    case "not-determined":
    case "restricted":
    case "unknown":
      return raw;
    default:
      return "unknown";
  }
}

function describe(kind: MacPermissionKind, state: MacPermissionState): string {
  if (kind === "microphone") {
    if (state === "granted") return "Microphone access is allowed.";
    if (state === "denied" || state === "restricted") {
      return "Microphone access is off. Enable CueAI in System Settings → Privacy & Security → Microphone.";
    }
    if (state === "not-determined") {
      return "CueAI has not asked for microphone access yet.";
    }
    return "Microphone permission state is unknown.";
  }

  if (kind === "screen") {
    if (state === "granted") return "Screen Recording access is allowed.";
    if (state === "denied" || state === "restricted") {
      return "Screen Recording is off. Enable CueAI in System Settings → Privacy & Security → Screen Recording.";
    }
    if (state === "not-determined") {
      return "macOS will ask for Screen Recording the first time CueAI captures the display.";
    }
    return "Screen Recording permission state is unknown.";
  }

  if (state === "granted") {
    return "Screen Recording is allowed, so CueAI can attempt system-audio capture. Connected only after audio tracks are received.";
  }
  if (state === "denied" || state === "restricted") {
    return "System audio needs Screen Recording. Enable CueAI in System Settings → Privacy & Security → Screen Recording.";
  }
  if (state === "not-determined") {
    return "System audio has not been authorized yet. macOS uses Screen Recording for this capture path.";
  }
  return "System audio permission state is unknown.";
}

function mediaStatus(media: "microphone" | "camera" | "screen"): MacPermissionState {
  if (process.platform !== "darwin") return "unknown";
  try {
    return mapStatus(systemPreferences.getMediaAccessStatus(media));
  } catch {
    return "unknown";
  }
}

export function checkMicrophonePermission(): MacPermissionStatus {
  const state = mediaStatus("microphone");
  return { state, message: describe("microphone", state) };
}

export function checkScreenRecordingPermission(): MacPermissionStatus {
  const state = mediaStatus("screen");
  return { state, message: describe("screen", state) };
}

export function checkSystemAudioPermission(): MacPermissionStatus {
  // Electron/Chromium system-audio capture on macOS is gated by Screen Recording.
  // Do not invent a granted/connected state here — the renderer reports capture.
  const state = mediaStatus("screen");
  return { state, message: describe("systemAudio", state) };
}

export function getMacOSPermissions(): MacPermissionsSnapshot {
  return {
    microphone: checkMicrophonePermission(),
    screenRecording: checkScreenRecordingPermission(),
    systemAudio: checkSystemAudioPermission(),
  };
}

export async function requestMicrophonePermission(): Promise<MacPermissionStatus> {
  const current = checkMicrophonePermission();
  if (current.state === "granted") return current;
  if (current.state === "denied" || current.state === "restricted") return current;

  if (process.platform === "darwin") {
    try {
      await systemPreferences.askForMediaAccess("microphone");
    } catch {
      // TCC prompt may already be showing or unsupported in this build.
    }
  }

  return checkMicrophonePermission();
}

export async function requestScreenRecordingPermission(): Promise<MacPermissionStatus> {
  const current = checkScreenRecordingPermission();
  if (current.state === "granted") return current;
  if (current.state === "denied" || current.state === "restricted") return current;

  // Screen Recording cannot be requested via askForMediaAccess. Enumerating
  // desktop sources is the supported way to trigger the macOS prompt.
  try {
    await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 },
    });
  } catch {
    // Permission prompt or TCC denial — read the real status below.
  }

  return checkScreenRecordingPermission();
}

export async function requestSystemAudioPermission(): Promise<MacPermissionStatus> {
  return requestScreenRecordingPermission().then(() => checkSystemAudioPermission());
}

export async function requestMacOSPermission(kind: MacPermissionKind): Promise<MacPermissionStatus> {
  if (kind === "microphone") return requestMicrophonePermission();
  if (kind === "screen") return requestScreenRecordingPermission();
  return requestSystemAudioPermission();
}

export async function openMacOSPrivacySettings(
  pane: MacPermissionKind | "privacy" = "privacy"
): Promise<boolean> {
  const url = PRIVACY_URLS[pane] || PRIVACY_URLS.privacy;
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    try {
      await shell.openExternal(PRIVACY_URLS.privacy);
      return true;
    } catch {
      return false;
    }
  }
}
