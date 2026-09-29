import { app } from "electron";
import { createLicensingService } from "../../../shared/licensing/service";
import {
  clearLicenseRecord,
  readLicenseRecord,
  writeLicenseRecord,
} from "../../../shared/licensing/secure-store";
import { deviceDisplayName, getOrCreateDeviceId, maskDeviceId } from "../../../shared/licensing/device-id";
import { resolveWorkspaceEnv } from "../../../shared/workspace-env";
import { getWebOrigin } from "./web-server";

function publicKeyPem() {
  return resolveWorkspaceEnv(app.getPath("userData"), "LICENSE_SIGNING_PUBLIC_KEY");
}

function enforcementEnabled() {
  const flag = resolveWorkspaceEnv(app.getPath("userData"), "LICENSE_ENFORCEMENT");
  if (flag === "false") return false;
  if (flag === "true") return true;
  return app.isPackaged && Boolean(publicKeyPem());
}

let service: ReturnType<typeof createLicensingService> | null = null;

export function getLicenseService() {
  if (!service) {
    const userData = app.getPath("userData");
    service = createLicensingService({
      platform: "windows",
      getDeviceId: () => getOrCreateDeviceId(userData),
      getAppVersion: () => app.getVersion(),
      getApiOrigin: () => getWebOrigin(),
      readLocal: () => readLicenseRecord(userData),
      writeLocal: (record) => writeLicenseRecord(userData, record),
      clearLocal: () => clearLicenseRecord(userData),
      fetchImpl: fetch,
      publicKeyPem: publicKeyPem(),
      enforcementEnabled: enforcementEnabled(),
    });
  }
  return service;
}

export function getLicenseDevicePublic() {
  const userData = app.getPath("userData");
  const deviceId = getOrCreateDeviceId(userData);
  return {
    deviceId,
    maskedId: maskDeviceId(deviceId, "windows"),
    deviceName: deviceDisplayName("windows"),
    platform: "windows" as const,
    appVersion: app.getVersion(),
    secureStorageAvailable: true,
  };
}
