import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeysMatch,
  signActivationPayload,
  type SignedActivationPayload,
} from "@/lib/server/license-crypto";
import {
  newActivationId,
  newLicenseId,
  readLicenseStore,
  updateLicenseStore,
  type DbLicense,
  type DbLicenseActivation,
  type LicenseType,
} from "@/lib/server/license-db";

export type LicenseState =
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "INVALID"
  | "DEVICE_LIMIT_REACHED"
  | "NOT_ACTIVATED";

export type LicensePublicResponse = {
  valid: boolean;
  state: LicenseState;
  status?: "active" | "expired" | "revoked";
  expiresAt?: string;
  licenseType?: LicenseType;
  clientName?: string;
  deviceId?: string;
  platform?: "windows" | "macos";
  devicesActive?: number;
  maxDevices?: number;
  message?: string;
  signedPayload?: SignedActivationPayload;
  signature?: string;
};

const GRACE_HOURS = Math.max(
  1,
  Math.min(168, Number(process.env.LICENSE_OFFLINE_GRACE_HOURS || "72") || 72),
);

function logLicense(event: string, meta: Record<string, string | number | boolean | undefined>) {
  const safe = { ...meta };
  delete safe.licenseKey;
  delete safe.rawKey;
  console.info(`[license] ${event}`, safe);
}

function isExpired(license: DbLicense, now = Date.now()) {
  return new Date(license.expiresAt).getTime() <= now;
}

function resolveLicenseState(
  license: DbLicense | null,
  activation: DbLicenseActivation | null,
  activeCount: number,
): LicenseState {
  if (!license) return "INVALID";
  if (license.status === "REVOKED") return "REVOKED";
  if (isExpired(license)) return "EXPIRED";
  if (!activation || activation.status !== "ACTIVE") return "NOT_ACTIVATED";
  if (activeCount > license.maxDevices) return "DEVICE_LIMIT_REACHED";
  return "ACTIVE";
}

function publicFromLicense(
  license: DbLicense,
  activation: DbLicenseActivation | null,
  activeCount: number,
  platform: "windows" | "macos",
  deviceId: string,
  extra?: Partial<LicensePublicResponse>,
): LicensePublicResponse {
  const state = resolveLicenseState(license, activation, activeCount);
  const valid = state === "ACTIVE";
  return {
    valid,
    state,
    status: state === "ACTIVE" ? "active" : state === "EXPIRED" ? "expired" : state === "REVOKED" ? "revoked" : undefined,
    expiresAt: license.expiresAt,
    licenseType: license.licenseType,
    clientName: license.clientName,
    deviceId,
    platform,
    devicesActive: activeCount,
    maxDevices: license.maxDevices,
    ...extra,
  };
}

function findLicenseByKey(store: Awaited<ReturnType<typeof readLicenseStore>>, rawKey: string) {
  const hash = hashLicenseKey(rawKey);
  return store.licenses.find((l) => l.licenseKeyHash === hash) || null;
}

function activeActivations(store: Awaited<ReturnType<typeof readLicenseStore>>, licenseId: string) {
  return store.activations.filter((a) => a.licenseId === licenseId && a.status === "ACTIVE");
}

function buildSignedActivation(
  license: DbLicense,
  activation: DbLicenseActivation,
  platform: "windows" | "macos",
): { signedPayload: SignedActivationPayload; signature: string } {
  const now = new Date();
  const graceUntil = new Date(now.getTime() + GRACE_HOURS * 3600_000).toISOString();
  const signedPayload: SignedActivationPayload = {
    licenseId: license.id,
    deviceId: activation.deviceId,
    platform,
    licenseType: license.licenseType,
    clientName: license.clientName,
    expiresAt: license.expiresAt,
    activatedAt: activation.activatedAt,
    validatedAt: now.toISOString(),
    graceUntil,
  };
  const signature = signActivationPayload(signedPayload);
  return { signedPayload, signature };
}

export async function generateLicense(input: {
  clientName: string;
  type: LicenseType;
  expiresAt: string;
  maxDevices: number;
  metadata?: Record<string, string | number | boolean>;
}): Promise<{ license: DbLicense; licenseKey: string }> {
  const licenseKey = generateLicenseKey();
  const licenseKeyHash = hashLicenseKey(licenseKey);
  const license: DbLicense = {
    id: newLicenseId(),
    licenseKeyHash,
    licenseType: input.type,
    clientName: input.clientName.slice(0, 120),
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    maxDevices: Math.max(1, Math.min(50, input.maxDevices)),
    metadata: input.metadata,
  };

  await updateLicenseStore((store) => {
    store.licenses.push(license);
  });

  logLicense("generated", {
    licenseId: license.id,
    clientName: license.clientName,
    licenseType: license.licenseType,
    maxDevices: license.maxDevices,
    expiresAt: license.expiresAt,
  });

  return { license, licenseKey };
}

export async function activateLicense(input: {
  licenseKey: string;
  deviceId: string;
  platform: "windows" | "macos";
  appVersion: string;
}): Promise<LicensePublicResponse> {
  const deviceId = input.deviceId.trim();
  const platform = input.platform;
  const appVersion = input.appVersion.slice(0, 32) || "1.0.0";

  if (!deviceId || deviceId.length < 8) {
    return { valid: false, state: "INVALID", message: "A valid device identifier is required." };
  }

  const store = await readLicenseStore();
  const license = findLicenseByKey(store, input.licenseKey);
  if (!license) {
    logLicense("activate.invalid_key", { deviceId: deviceId.slice(0, 8) + "…", platform });
    return { valid: false, state: "INVALID", message: "That license key is invalid." };
  }

  if (license.status === "REVOKED") {
    logLicense("activate.revoked", { licenseId: license.id, deviceId: deviceId.slice(0, 8) + "…" });
    return { valid: false, state: "REVOKED", message: "This license has been revoked." };
  }

  if (isExpired(license)) {
    logLicense("activate.expired", { licenseId: license.id });
    return { valid: false, state: "EXPIRED", message: "This license has expired." };
  }

  const now = new Date().toISOString();
  let activation: DbLicenseActivation | null = null;
  let activeCount = 0;

  await updateLicenseStore((s) => {
    const lic = s.licenses.find((l) => l.id === license.id);
    if (!lic) return;

    const existing = s.activations.find(
      (a) => a.licenseId === lic.id && a.deviceId === deviceId && a.status === "ACTIVE",
    );

    activeCount = activeActivations(s, lic.id).length;

    if (existing) {
      existing.lastSeenAt = now;
      existing.appVersion = appVersion;
      existing.platform = platform;
      activation = existing;
      return;
    }

    if (activeCount >= lic.maxDevices) {
      return;
    }

    activation = {
      id: newActivationId(),
      licenseId: lic.id,
      deviceId,
      platform,
      appVersion,
      activatedAt: now,
      lastSeenAt: now,
      status: "ACTIVE",
    };
    s.activations.push(activation);
    activeCount = activeActivations(s, lic.id).length;
  });

  const refreshed = await readLicenseStore();
  const currentLicense = refreshed.licenses.find((l) => l.id === license.id)!;
  activation =
    refreshed.activations.find(
      (a) => a.licenseId === license.id && a.deviceId === deviceId && a.status === "ACTIVE",
    ) || activation;
  activeCount = activeActivations(refreshed, license.id).length;

  if (!activation) {
    logLicense("activate.device_limit", { licenseId: license.id, activeCount, maxDevices: license.maxDevices });
    return {
      valid: false,
      state: "DEVICE_LIMIT_REACHED",
      message: "This license has reached its device limit.",
      maxDevices: license.maxDevices,
      devicesActive: activeCount,
    };
  }

  const state = resolveLicenseState(currentLicense, activation, activeCount);
  if (state !== "ACTIVE") {
    return publicFromLicense(currentLicense, activation, activeCount, platform, deviceId, {
      valid: false,
      message:
        state === "EXPIRED"
          ? "This license has expired."
          : state === "REVOKED"
            ? "This license has been revoked."
            : "Activation failed.",
    });
  }

  const { signedPayload, signature } = buildSignedActivation(currentLicense, activation, platform);
  logLicense("activate.success", {
    licenseId: license.id,
    activationId: activation.id,
    platform,
    deviceId: deviceId.slice(0, 8) + "…",
  });

  return {
    ...publicFromLicense(currentLicense, activation, activeCount, platform, deviceId),
    signedPayload,
    signature,
  };
}

export async function validateLicense(input: {
  licenseKey?: string;
  licenseId?: string;
  deviceId: string;
  platform: "windows" | "macos";
  appVersion?: string;
}): Promise<LicensePublicResponse> {
  const store = await readLicenseStore();
  let license: DbLicense | null = null;

  if (input.licenseKey) {
    license = findLicenseByKey(store, input.licenseKey);
  } else if (input.licenseId) {
    license = store.licenses.find((l) => l.id === input.licenseId) || null;
  }

  if (!license) {
    return { valid: false, state: "INVALID", message: "That license key is invalid." };
  }

  if (license.status === "REVOKED") {
    logLicense("validate.revoked", { licenseId: license.id });
    return { valid: false, state: "REVOKED", message: "This license has been revoked." };
  }

  if (isExpired(license)) {
    logLicense("validate.expired", { licenseId: license.id });
    return { valid: false, state: "EXPIRED", message: "This license has expired." };
  }

  const activation =
    store.activations.find(
      (a) =>
        a.licenseId === license!.id &&
        a.deviceId === input.deviceId &&
        a.status === "ACTIVE",
    ) || null;

  const activeCount = activeActivations(store, license.id).length;
  const state = resolveLicenseState(license, activation, activeCount);

  if (state === "NOT_ACTIVATED") {
    return { valid: false, state: "NOT_ACTIVATED", message: "This device is not activated." };
  }

  if (state !== "ACTIVE") {
    return publicFromLicense(license, activation, activeCount, input.platform, input.deviceId, {
      valid: false,
      message:
        state === "DEVICE_LIMIT_REACHED"
          ? "This license has reached its device limit."
          : "License validation failed.",
    });
  }

  const now = new Date().toISOString();
  await updateLicenseStore((s) => {
    const act = s.activations.find(
      (a) => a.licenseId === license!.id && a.deviceId === input.deviceId && a.status === "ACTIVE",
    );
    if (act) {
      act.lastSeenAt = now;
      if (input.appVersion) act.appVersion = input.appVersion.slice(0, 32);
    }
  });

  const { signedPayload, signature } = buildSignedActivation(license, activation!, input.platform);
  logLicense("validate.success", { licenseId: license.id, platform: input.platform });

  return {
    ...publicFromLicense(license, activation, activeCount, input.platform, input.deviceId),
    signedPayload,
    signature,
  };
}

export async function deactivateLicense(input: {
  licenseId: string;
  deviceId: string;
}): Promise<LicensePublicResponse> {
  const store = await readLicenseStore();
  const license = store.licenses.find((l) => l.id === input.licenseId) || null;
  if (!license) {
    return { valid: false, state: "INVALID", message: "That license key is invalid." };
  }

  const now = new Date().toISOString();
  await updateLicenseStore((s) => {
    const act = s.activations.find(
      (a) => a.licenseId === input.licenseId && a.deviceId === input.deviceId && a.status === "ACTIVE",
    );
    if (act) {
      act.status = "DEACTIVATED";
      act.deactivatedAt = now;
      act.lastSeenAt = now;
    }
  });

  logLicense("deactivate", { licenseId: input.licenseId, deviceId: input.deviceId.slice(0, 8) + "…" });
  return { valid: false, state: "NOT_ACTIVATED", message: "Device deactivated." };
}

export async function getLicenseStatus(input: {
  licenseId: string;
  deviceId: string;
  platform: "windows" | "macos";
}): Promise<LicensePublicResponse> {
  return validateLicense({
    licenseId: input.licenseId,
    deviceId: input.deviceId,
    platform: input.platform,
  });
}

export async function revokeLicense(licenseId: string): Promise<boolean> {
  let found = false;
  await updateLicenseStore((s) => {
    const lic = s.licenses.find((l) => l.id === licenseId);
    if (!lic) return;
    lic.status = "REVOKED";
    found = true;
    for (const act of s.activations) {
      if (act.licenseId === licenseId && act.status === "ACTIVE") {
        act.status = "DEACTIVATED";
        act.deactivatedAt = new Date().toISOString();
      }
    }
  });
  if (found) logLicense("revoke", { licenseId });
  return found;
}

export { licenseKeysMatch, GRACE_HOURS };
