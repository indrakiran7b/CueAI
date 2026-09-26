import { apiActivateLicense, apiDeactivateLicense, apiValidateLicense } from "./client";
import { isPayloadStillValid, verifySignedActivation } from "./verify";
import type {
  LicenseActivateResult,
  LicensePlatform,
  LicenseStatusResult,
  LocalActivationRecord,
  SignedActivationPayload,
} from "./types";

export type LicensingDeps = {
  platform: LicensePlatform;
  getDeviceId: () => string;
  getAppVersion: () => string;
  getApiOrigin: () => string;
  readLocal: () => LocalActivationRecord | null;
  writeLocal: (record: LocalActivationRecord) => void;
  clearLocal: () => void;
  fetchImpl: typeof fetch;
  publicKeyPem: string;
  enforcementEnabled: boolean;
};

function userMessageForState(state: LicenseStatusResult["state"]): string {
  switch (state) {
    case "EXPIRED":
      return "Your CueAI license has expired.";
    case "SUSPENDED":
      return "Your CueAI license is suspended. Contact support or renew your subscription.";
    case "REVOKED":
      return "Your CueAI license has been revoked.";
    case "DEVICE_LIMIT_REACHED":
      return "This license has reached its device limit.";
    case "INVALID":
      return "That license key is invalid.";
    case "NOT_ACTIVATED":
      return "This device is not activated.";
    case "NETWORK_ERROR":
      return "Unable to connect to the licensing server. Please check your internet connection.";
    default:
      return "License validation failed.";
  }
}

function recordFromApi(
  payload: SignedActivationPayload,
  signature: string,
  platform: LicensePlatform,
): LocalActivationRecord {
  return {
    licenseId: payload.licenseId,
    deviceId: payload.deviceId,
    platform,
    licenseType: payload.licenseType,
    clientName: payload.clientName,
    expiresAt: payload.expiresAt,
    signedPayload: payload,
    signature,
    lastValidatedAt: payload.validatedAt,
  };
}

function statusFromLocal(record: LocalActivationRecord, publicKeyPem: string): LicenseStatusResult {
  const sigOk = verifySignedActivation(record.signedPayload, record.signature, publicKeyPem);
  if (!sigOk) {
    return { ok: false, state: "INVALID", authorized: false, message: "Local license data is invalid." };
  }
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    return {
      ok: false,
      state: "EXPIRED",
      authorized: false,
      message: userMessageForState("EXPIRED"),
      clientName: record.clientName,
      licenseType: record.licenseType,
      expiresAt: record.expiresAt,
      licenseId: record.licenseId,
      deviceId: record.deviceId,
      platform: record.platform,
    };
  }
  if (!isPayloadStillValid(record.signedPayload)) {
    return {
      ok: false,
      state: "NETWORK_ERROR",
      authorized: false,
      message: "License must be revalidated online.",
      clientName: record.clientName,
      licenseType: record.licenseType,
      expiresAt: record.expiresAt,
      licenseId: record.licenseId,
      deviceId: record.deviceId,
      platform: record.platform,
    };
  }
  return {
    ok: true,
    state: "ACTIVE",
    authorized: true,
    clientName: record.clientName,
    licenseType: record.licenseType,
    expiresAt: record.expiresAt,
    licenseId: record.licenseId,
    deviceId: record.deviceId,
    platform: record.platform,
  };
}

export function createLicensingService(deps: LicensingDeps) {
  const deviceId = () => deps.getDeviceId();

  async function checkLocal(): Promise<LicenseStatusResult> {
    if (!deps.enforcementEnabled) {
      return { ok: true, state: "ACTIVE", authorized: true, message: "Licensing disabled." };
    }
    const local = deps.readLocal();
    if (!local) {
      return { ok: false, state: "NOT_ACTIVATED", authorized: false, message: userMessageForState("NOT_ACTIVATED") };
    }
    if (local.deviceId !== deviceId()) {
      return { ok: false, state: "INVALID", authorized: false, message: "Device identity mismatch." };
    }
    return statusFromLocal(local, deps.publicKeyPem);
  }

  async function activate(licenseKey: string): Promise<LicenseActivateResult> {
    if (!deps.enforcementEnabled) {
      return { ok: true, state: "ACTIVE", authorized: true };
    }
    const result = await apiActivateLicense(
      deps.getApiOrigin(),
      {
        licenseKey,
        deviceId: deviceId(),
        platform: deps.platform,
        appVersion: deps.getAppVersion(),
      },
      deps.fetchImpl,
    );

    if (
      result.authorized &&
      result.signedPayload &&
      typeof result.signedPayload === "object" &&
      result.signature
    ) {
      const payload = result.signedPayload as SignedActivationPayload;
      if (verifySignedActivation(payload, result.signature, deps.publicKeyPem)) {
        deps.writeLocal(recordFromApi(payload, result.signature, deps.platform));
      }
    }

    if (!result.message) result.message = userMessageForState(result.state);
    return result;
  }

  async function validateOnline(): Promise<LicenseStatusResult> {
    if (!deps.enforcementEnabled) {
      return { ok: true, state: "ACTIVE", authorized: true };
    }
    const local = deps.readLocal();
    if (!local) {
      return { ok: false, state: "NOT_ACTIVATED", authorized: false, message: userMessageForState("NOT_ACTIVATED") };
    }

    const remote = await apiValidateLicense(
      deps.getApiOrigin(),
      {
        licenseId: local.licenseId,
        deviceId: deviceId(),
        platform: deps.platform,
        appVersion: deps.getAppVersion(),
      },
      deps.fetchImpl,
    );

    if (remote.state === "NETWORK_ERROR") {
      const cached = statusFromLocal(local, deps.publicKeyPem);
      if (cached.authorized) return cached;
      return remote;
    }

    if (
      remote.authorized &&
      remote.signedPayload &&
      typeof remote.signedPayload === "object" &&
      remote.signature
    ) {
      const payload = remote.signedPayload as SignedActivationPayload;
      if (verifySignedActivation(payload, remote.signature, deps.publicKeyPem)) {
        deps.writeLocal(recordFromApi(payload, remote.signature, deps.platform));
        return { ...remote, ok: true, authorized: true };
      }
    }

    deps.clearLocal();
    if (!remote.message) remote.message = userMessageForState(remote.state);
    return { ...remote, ok: false, authorized: false };
  }

  async function resolveStartupAuthorized(): Promise<LicenseStatusResult> {
    const local = await checkLocal();
    if (!local.authorized) return local;
    if (local.state === "ACTIVE") {
      const online = await validateOnline();
      return online;
    }
    return local;
  }

  async function resolveStartupPath(): Promise<string> {
    if (!deps.enforcementEnabled) return "/dashboard";
    const status = await resolveStartupAuthorized();
    if (!status.authorized) {
      const state = status.state || "NOT_ACTIVATED";
      return `/license?desktop=${deps.platform}&state=${encodeURIComponent(state)}`;
    }
    return deps.platform === "macos" ? "/login?desktop=mac" : "/dashboard";
  }

  async function deactivate(): Promise<LicenseStatusResult> {
    const local = deps.readLocal();
    if (!local) {
      return { ok: true, state: "NOT_ACTIVATED", authorized: false, message: "Device deactivated." };
    }
    const remote = await apiDeactivateLicense(
      deps.getApiOrigin(),
      { licenseId: local.licenseId, deviceId: deviceId() },
      deps.fetchImpl,
    );
    deps.clearLocal();
    return {
      ...remote,
      ok: true,
      authorized: false,
      state: "NOT_ACTIVATED",
      message: "Device deactivated.",
    };
  }

  function getPublicStatus(): LicenseStatusResult {
    const local = deps.readLocal();
    if (!local) {
      return { ok: false, state: "NOT_ACTIVATED", authorized: false, deviceId: deviceId(), platform: deps.platform };
    }
    return statusFromLocal(local, deps.publicKeyPem);
  }

  function resolveInitialPath(): string {
    if (!deps.enforcementEnabled) return "/dashboard";
    const local = deps.readLocal();
    if (!local) {
      return `/license?desktop=${deps.platform}`;
    }
    const cached = statusFromLocal(local, deps.publicKeyPem);
    if (!cached.authorized) {
      return `/license?desktop=${deps.platform}&state=${cached.state}`;
    }
    return deps.platform === "macos" ? "/login?desktop=mac" : "/dashboard";
  }

  return {
    checkLocal,
    activate,
    validateOnline,
    resolveStartupAuthorized,
    resolveStartupPath,
    deactivate,
    getPublicStatus,
    resolveInitialPath,
    getDeviceId: deviceId,
    getPlatform: () => deps.platform,
  };
}

export type LicensingService = ReturnType<typeof createLicensingService>;
