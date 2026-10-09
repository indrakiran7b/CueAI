export type DeviceAuthHeaders = Record<string, string>;

type DeviceBridge = {
  getDeviceAuthHeaders?: () => Promise<DeviceAuthHeaders>;
};

/**
 * Overlay/renderer helper. Credentials stay in the main process;
 * only per-request headers are returned.
 */
export async function deviceAuthHeaders(): Promise<DeviceAuthHeaders> {
  try {
    const bridge = (typeof window !== "undefined" ? window.cueai : undefined) as
      | DeviceBridge
      | undefined;
    if (typeof bridge?.getDeviceAuthHeaders === "function") {
      const headers = await bridge.getDeviceAuthHeaders();
      if (headers && typeof headers === "object") return headers;
    }
  } catch {
    // Registration may not have completed yet.
  }
  return {};
}
