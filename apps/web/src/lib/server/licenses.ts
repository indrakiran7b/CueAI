import {
  entitlementsFromKeygate,
  isKeygateEnabled,
  keygateActivate,
  keygateDeactivate,
  keygateEntitlements,
  keygateVerify,
  userMessageForKeygateState,
  type KeygateMappedState,
} from "@/lib/server/keygate";
import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeysMatch,
  signActivationPayload,
  type SignedActivationPayload,
} from "@/lib/server/license-crypto";
import {
  newActivationId,
  newKeygateBindingId,
  newLicenseId,
  readLicenseStore,
  updateLicenseStore,
  type DbKeygateBinding,
  type DbLicense,
  type DbLicenseActivation,
  type LicenseType,
} from "@/lib/server/license-db";
import { decryptSecret, encryptSecret } from "@/lib/server/session";

export type LicenseState =
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "REVOKED"
  | "INVALID"
  | "DEVICE_LIMIT_REACHED"
  | "NOT_ACTIVATED";

export type LicensePublicResponse = {
  valid: boolean;
  state: LicenseState;
  status?: "active" | "expired" | "revoked" | "suspended";
  expiresAt?: string;
  licenseType?: LicenseType | string;
  clientName?: string;
  deviceId?: string;
  platform?: "windows" | "macos";
  devicesActive?: number;
  maxDevices?: number;
  message?: string;
  signedPayload?: SignedActivationPayload;
  signature?: string;
  plan?: string;
  entitlements?: {
    "meeting.full_summary": boolean;
    "meeting.max_questions": number;
    desktop_companion: boolean;
  };
  provider?: "keygate" | "local";
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

function publicStatusFromState(
  state: LicenseState,
): LicensePublicResponse["status"] {
  if (state === "ACTIVE") return "active";
  if (state === "EXPIRED") return "expired";
  if (state === "REVOKED") return "revoked";
  if (state === "SUSPENDED") return "suspended";
  return undefined;
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
    status: publicStatusFromState(state),
    expiresAt: license.expiresAt,
    licenseType: license.licenseType,
    clientName: license.clientName,
    deviceId,
    platform,
    devicesActive: activeCount,
    maxDevices: license.maxDevices,
    provider: "local",
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
  license: {
    id: string;
    licenseType: string;
    clientName: string;
    expiresAt: string;
  },
  activation: { deviceId: string; activatedAt: string },
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

function planToLicenseType(plan: string): LicenseType {
  const p = plan.toLowerCase();
  if (p === "enterprise") return "ENTERPRISE";
  if (p === "business") return "BUSINESS";
  if (p === "pro") return "PRO";
  return "FREE";
}

function keygateStateToLicenseState(state: KeygateMappedState): LicenseState {
  if (state === "NETWORK_ERROR") return "INVALID";
  return state;
}

async function upsertKeygateBinding(input: {
  licenseId: string;
  deviceId: string;
  platform: "windows" | "macos";
  licenseKey: string;
  planName?: string;
  planId?: string;
  features?: Record<string, unknown>;
  clientName?: string;
  expiresAt?: string;
}): Promise<DbKeygateBinding> {
  const now = new Date().toISOString();
  let saved: DbKeygateBinding | null = null;

  await updateLicenseStore((store) => {
    const existing = store.keygateBindings.find(
      (b) =>
        b.licenseId === input.licenseId &&
        b.deviceId === input.deviceId &&
        b.status === "ACTIVE",
    );
    if (existing) {
      existing.licenseKeyEnc = encryptSecret(input.licenseKey);
      existing.lastSeenAt = now;
      existing.platform = input.platform;
      existing.planName = input.planName ?? existing.planName;
      existing.planId = input.planId ?? existing.planId;
      existing.features = input.features ?? existing.features;
      existing.clientName = input.clientName ?? existing.clientName;
      existing.expiresAt = input.expiresAt ?? existing.expiresAt;
      saved = existing;
      return;
    }

    const binding: DbKeygateBinding = {
      id: newKeygateBindingId(),
      licenseId: input.licenseId,
      deviceId: input.deviceId,
      platform: input.platform,
      licenseKeyEnc: encryptSecret(input.licenseKey),
      planName: input.planName,
      planId: input.planId,
      features: input.features,
      clientName: input.clientName,
      expiresAt: input.expiresAt,
      activatedAt: now,
      lastSeenAt: now,
      status: "ACTIVE",
    };
    store.keygateBindings.push(binding);
    saved = binding;
  });

  return saved!;
}

function findActiveKeygateBinding(
  store: Awaited<ReturnType<typeof readLicenseStore>>,
  licenseId: string,
  deviceId: string,
) {
  return (
    store.keygateBindings.find(
      (b) => b.licenseId === licenseId && b.deviceId === deviceId && b.status === "ACTIVE",
    ) || null
  );
}

function responseFromKeygate(input: {
  state: LicenseState;
  deviceId: string;
  platform: "windows" | "macos";
  licenseId: string;
  planName?: string;
  planId?: string;
  features?: Record<string, unknown>;
  expiresAt?: string;
  clientName?: string;
  activatedAt: string;
  message?: string;
}): LicensePublicResponse {
  const mapped = entitlementsFromKeygate({
    planName: input.planName,
    features: input.features,
  });
  const licenseType = planToLicenseType(mapped.plan);
  const clientName = input.clientName || input.planName || "CueAI License";
  const expiresAt =
    input.expiresAt ||
    new Date(Date.now() + 365 * 24 * 3600_000).toISOString();

  const valid = input.state === "ACTIVE";
  let signedPayload: SignedActivationPayload | undefined;
  let signature: string | undefined;

  if (valid) {
    const signed = buildSignedActivation(
      {
        id: input.licenseId,
        licenseType,
        clientName,
        expiresAt,
      },
      { deviceId: input.deviceId, activatedAt: input.activatedAt },
      input.platform,
    );
    signedPayload = signed.signedPayload;
    signature = signed.signature;
  }

  return {
    valid,
    state: input.state,
    status: publicStatusFromState(input.state),
    expiresAt,
    licenseType,
    clientName,
    deviceId: input.deviceId,
    platform: input.platform,
    message: input.message,
    signedPayload,
    signature,
    plan: mapped.plan,
    entitlements: mapped.entitlements,
    provider: "keygate",
  };
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

async function activateViaKeygate(input: {
  licenseKey: string;
  deviceId: string;
  platform: "windows" | "macos";
  appVersion: string;
}): Promise<LicensePublicResponse> {
  const activated = await keygateActivate({
    licenseKey: input.licenseKey,
    deviceId: input.deviceId,
    label: `CueAI ${input.platform} ${input.appVersion}`,
  });

  if (!activated.ok) {
    logLicense("keygate.activate.fail", {
      state: activated.state,
      platform: input.platform,
      deviceId: input.deviceId.slice(0, 8) + "…",
    });
    return {
      valid: false,
      state: keygateStateToLicenseState(activated.state),
      message: activated.message,
      provider: "keygate",
      deviceId: input.deviceId,
      platform: input.platform,
    };
  }

  const licenseId = activated.data?.license_id || `kg_${hashLicenseKey(input.licenseKey).slice(0, 12)}`;

  // Verify immediately to pull plan/features/expiry (activate response is minimal).
  const verified = await keygateVerify({
    licenseKey: input.licenseKey,
    deviceId: input.deviceId,
  });

  if (!verified.ok || verified.state !== "ACTIVE") {
    const state = keygateStateToLicenseState(verified.state);
    return {
      valid: false,
      state,
      message: verified.message || userMessageForKeygateState(verified.state),
      provider: "keygate",
      deviceId: input.deviceId,
      platform: input.platform,
    };
  }

  const planName = verified.data?.plan_name;
  const features = verified.data?.features;
  const expiresAt = verified.data?.valid_until || undefined;
  const binding = await upsertKeygateBinding({
    licenseId: verified.data?.license_id || licenseId,
    deviceId: input.deviceId,
    platform: input.platform,
    licenseKey: input.licenseKey,
    planName: planName || undefined,
    planId: verified.data?.plan_id,
    features,
    clientName: planName || "CueAI License",
    expiresAt: expiresAt || undefined,
  });

  logLicense("keygate.activate.success", {
    licenseId: binding.licenseId,
    platform: input.platform,
    deviceId: input.deviceId.slice(0, 8) + "…",
  });

  return responseFromKeygate({
    state: "ACTIVE",
    deviceId: input.deviceId,
    platform: input.platform,
    licenseId: binding.licenseId,
    planName,
    planId: verified.data?.plan_id,
    features,
    expiresAt: expiresAt || undefined,
    clientName: binding.clientName,
    activatedAt: binding.activatedAt,
    message: "License activated.",
  });
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

  if (isKeygateEnabled()) {
    return activateViaKeygate({
      licenseKey: input.licenseKey,
      deviceId,
      platform,
      appVersion,
    });
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
    logLicense("activate.device_limit", {
      licenseId: license.id,
      activeCount,
      maxDevices: license.maxDevices,
    });
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

  const { signedPayload, signature } = buildSignedActivation(
    currentLicense,
    activation,
    platform,
  );
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

async function validateViaKeygate(input: {
  licenseKey?: string;
  licenseId?: string;
  deviceId: string;
  platform: "windows" | "macos";
}): Promise<LicensePublicResponse> {
  const store = await readLicenseStore();
  let licenseKey = input.licenseKey?.trim();
  let binding: DbKeygateBinding | null = null;

  if (!licenseKey && input.licenseId) {
    binding = findActiveKeygateBinding(store, input.licenseId, input.deviceId);
    if (!binding) {
      return {
        valid: false,
        state: "NOT_ACTIVATED",
        message: "This device is not activated.",
        provider: "keygate",
        deviceId: input.deviceId,
        platform: input.platform,
      };
    }
    try {
      licenseKey = decryptSecret(binding.licenseKeyEnc);
    } catch {
      return {
        valid: false,
        state: "INVALID",
        message: "Stored license credential is unreadable. Please reactivate.",
        provider: "keygate",
      };
    }
  }

  if (!licenseKey) {
    return {
      valid: false,
      state: "INVALID",
      message: "licenseKey or licenseId is required.",
      provider: "keygate",
    };
  }

  const verified = await keygateVerify({
    licenseKey,
    deviceId: input.deviceId,
  });

  if (verified.state === "NETWORK_ERROR") {
    return {
      valid: false,
      state: "INVALID",
      message: verified.message,
      provider: "keygate",
      deviceId: input.deviceId,
      platform: input.platform,
    };
  }

  if (!verified.ok || verified.state !== "ACTIVE") {
    const state = keygateStateToLicenseState(verified.state);
    if (binding || input.licenseId) {
      await updateLicenseStore((s) => {
        for (const b of s.keygateBindings) {
          if (
            b.deviceId === input.deviceId &&
            (input.licenseId ? b.licenseId === input.licenseId : true) &&
            b.status === "ACTIVE"
          ) {
            if (state === "REVOKED" || state === "EXPIRED" || state === "SUSPENDED") {
              b.status = "DEACTIVATED";
              b.deactivatedAt = new Date().toISOString();
            }
          }
        }
      });
    }
    return {
      valid: false,
      state,
      message: verified.message,
      provider: "keygate",
      deviceId: input.deviceId,
      platform: input.platform,
    };
  }

  const licenseId = verified.data?.license_id || input.licenseId || binding?.licenseId;
  if (!licenseId) {
    return {
      valid: false,
      state: "INVALID",
      message: "License identity missing from Keygate response.",
      provider: "keygate",
    };
  }

  const saved = await upsertKeygateBinding({
    licenseId,
    deviceId: input.deviceId,
    platform: input.platform,
    licenseKey,
    planName: verified.data?.plan_name,
    planId: verified.data?.plan_id,
    features: verified.data?.features,
    clientName: verified.data?.plan_name || binding?.clientName || "CueAI License",
    expiresAt: verified.data?.valid_until || undefined,
  });

  return responseFromKeygate({
    state: "ACTIVE",
    deviceId: input.deviceId,
    platform: input.platform,
    licenseId,
    planName: verified.data?.plan_name,
    planId: verified.data?.plan_id,
    features: verified.data?.features,
    expiresAt: verified.data?.valid_until || undefined,
    clientName: saved.clientName,
    activatedAt: saved.activatedAt,
    message: "License valid.",
  });
}

export async function validateLicense(input: {
  licenseKey?: string;
  licenseId?: string;
  deviceId: string;
  platform: "windows" | "macos";
  appVersion?: string;
}): Promise<LicensePublicResponse> {
  if (isKeygateEnabled()) {
    return validateViaKeygate(input);
  }

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
  if (isKeygateEnabled()) {
    const store = await readLicenseStore();
    const binding = findActiveKeygateBinding(store, input.licenseId, input.deviceId);
    if (binding) {
      try {
        const licenseKey = decryptSecret(binding.licenseKeyEnc);
        await keygateDeactivate({ licenseKey, deviceId: input.deviceId });
      } catch (err) {
        console.error(
          "[license] keygate.deactivate.error",
          err instanceof Error ? err.message : err,
        );
      }
    }
    const now = new Date().toISOString();
    await updateLicenseStore((s) => {
      for (const b of s.keygateBindings) {
        if (
          b.licenseId === input.licenseId &&
          b.deviceId === input.deviceId &&
          b.status === "ACTIVE"
        ) {
          b.status = "DEACTIVATED";
          b.deactivatedAt = now;
          b.lastSeenAt = now;
        }
      }
    });
    logLicense("keygate.deactivate", {
      licenseId: input.licenseId,
      deviceId: input.deviceId.slice(0, 8) + "…",
    });
    return {
      valid: false,
      state: "NOT_ACTIVATED",
      message: "Device deactivated.",
      provider: "keygate",
    };
  }

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

  logLicense("deactivate", {
    licenseId: input.licenseId,
    deviceId: input.deviceId.slice(0, 8) + "…",
  });
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

export async function getLicenseEntitlements(input: {
  licenseId?: string;
  licenseKey?: string;
  deviceId: string;
}): Promise<LicensePublicResponse> {
  if (!isKeygateEnabled()) {
    return {
      valid: false,
      state: "NOT_ACTIVATED",
      message: "Keygate is not configured. Local licenses do not expose remote entitlements.",
      plan: "free",
      entitlements: {
        "meeting.full_summary": false,
        "meeting.max_questions": 5,
        desktop_companion: true,
      },
      provider: "local",
    };
  }

  const store = await readLicenseStore();
  let licenseKey = input.licenseKey?.trim();
  if (!licenseKey && input.licenseId) {
    const binding = findActiveKeygateBinding(store, input.licenseId, input.deviceId);
    if (!binding) {
      return {
        valid: false,
        state: "NOT_ACTIVATED",
        message: "This device is not activated.",
        provider: "keygate",
      };
    }
    licenseKey = decryptSecret(binding.licenseKeyEnc);
  }
  if (!licenseKey) {
    return {
      valid: false,
      state: "INVALID",
      message: "licenseKey or licenseId is required.",
      provider: "keygate",
    };
  }

  const ent = await keygateEntitlements({ licenseKey });
  const mapped = entitlementsFromKeygate({
    planName: ent.planName,
    features: ent.features as Record<string, unknown> | undefined,
  });
  return {
    valid: ent.ok,
    state: keygateStateToLicenseState(ent.state),
    message: ent.message,
    plan: mapped.plan,
    entitlements: mapped.entitlements,
    clientName: ent.planName,
    provider: "keygate",
    deviceId: input.deviceId,
  };
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

export { licenseKeysMatch, GRACE_HOURS, isKeygateEnabled };
