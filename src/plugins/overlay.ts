import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type OverlayHost = "meet" | "zoom" | "teams";
export type OverlayState = "running" | "stopped" | "minimized" | "hidden";

export type OverlayStateEvent = {
  state: OverlayState;
  privacyOn: boolean;
  hiddenForShare?: boolean;
};

type CueOverlayPlugin = {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean; openedSettings?: boolean }>;
  start(options: { privacyOn: boolean; host: OverlayHost }): Promise<{
    running: boolean;
    privacyOn: boolean;
    hiddenForShare?: boolean;
  }>;
  stop(): Promise<{ running: boolean }>;
  isRunning(): Promise<{
    running: boolean;
    minimized: boolean;
    privacyOn: boolean;
    hiddenForShare?: boolean;
  }>;
  setPrivacy(options: { enabled: boolean }): Promise<{ privacyOn: boolean; hiddenForShare?: boolean }>;
  hideForShare(): Promise<{ hiddenForShare: boolean }>;
  show(): Promise<{ hiddenForShare: boolean }>;
  addListener(
    eventName: "overlayState",
    listenerFunc: (event: OverlayStateEvent) => void,
  ): Promise<PluginListenerHandle>;
};

const CueOverlay = registerPlugin<CueOverlayPlugin>("CueOverlay");

export function isNativeOverlayAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function checkOverlayPermission() {
  if (!isNativeOverlayAvailable()) return { granted: true };
  return CueOverlay.checkPermission();
}

export async function requestOverlayPermission() {
  if (!isNativeOverlayAvailable()) return { granted: true };
  return CueOverlay.requestPermission();
}

export async function startOverlay(options: { privacyOn: boolean; host: OverlayHost }) {
  if (!isNativeOverlayAvailable()) {
    return { running: true, privacyOn: options.privacyOn, hiddenForShare: false, simulated: true as const };
  }
  const result = await CueOverlay.start(options);
  return { ...result, simulated: false as const };
}

export async function stopOverlay() {
  if (!isNativeOverlayAvailable()) {
    return { running: false, simulated: true as const };
  }
  const result = await CueOverlay.stop();
  return { ...result, simulated: false as const };
}

export async function getOverlayStatus() {
  if (!isNativeOverlayAvailable()) {
    return {
      running: false,
      minimized: false,
      privacyOn: true,
      hiddenForShare: false,
      simulated: true as const,
    };
  }
  const result = await CueOverlay.isRunning();
  return { ...result, simulated: false as const };
}

export async function setOverlayPrivacy(enabled: boolean) {
  if (!isNativeOverlayAvailable()) {
    return { privacyOn: enabled, hiddenForShare: false, simulated: true as const };
  }
  const result = await CueOverlay.setPrivacy({ enabled });
  return { ...result, simulated: false as const };
}

export async function hideOverlayForShare() {
  if (!isNativeOverlayAvailable()) {
    return { hiddenForShare: true, simulated: true as const };
  }
  return CueOverlay.hideForShare();
}

export async function showOverlay() {
  if (!isNativeOverlayAvailable()) {
    return { hiddenForShare: false, simulated: true as const };
  }
  return CueOverlay.show();
}

export async function listenOverlayState(listener: (event: OverlayStateEvent) => void) {
  if (!isNativeOverlayAvailable()) {
    return { remove: async () => undefined } as PluginListenerHandle;
  }
  return CueOverlay.addListener("overlayState", listener);
}
