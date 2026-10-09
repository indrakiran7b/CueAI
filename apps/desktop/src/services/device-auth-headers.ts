export type DeviceAuthHeaders = Record<string, string>;

type DeviceBridge = {
  getDeviceAuthHeaders?: () => Promise<DeviceAuthHeaders>;
};

function pickHeader(raw: DeviceAuthHeaders, names: string[]) {
  for (const name of names) {
    const value = String(raw[name] || "").trim();
    if (value) return value;
  }
  return "";
}

/**
 * Overlay/renderer helper. Credentials stay in the main process;
 * only per-request headers are returned. Never logs header values.
 */
export async function deviceAuthHeaders(): Promise<DeviceAuthHeaders> {
  try {
    const bridge = (typeof window !== "undefined" ? window.cueai : undefined) as
      | DeviceBridge
      | undefined;
    if (typeof bridge?.getDeviceAuthHeaders !== "function") {
      console.log("[AUTH] device headers attached", { deviceId: false, credential: false });
      return {};
    }
    const raw = await bridge.getDeviceAuthHeaders();
    if (!raw || typeof raw !== "object") {
      console.log("[AUTH] device headers attached", { deviceId: false, credential: false });
      return {};
    }
    const id = pickHeader(raw, ["X-CueAI-Device-Id", "x-cueai-device-id"]);
    const credential = pickHeader(raw, [
      "X-CueAI-Device-Credential",
      "x-cueai-device-credential",
    ]);
    const headers: DeviceAuthHeaders = {};
    if (id) headers["X-CueAI-Device-Id"] = id;
    if (credential) headers["X-CueAI-Device-Credential"] = credential;
    console.log("[AUTH] device headers attached", {
      deviceId: Boolean(id),
      credential: Boolean(credential),
    });
    return headers;
  } catch {
    console.log("[AUTH] device headers attached", { deviceId: false, credential: false });
    return {};
  }
}
