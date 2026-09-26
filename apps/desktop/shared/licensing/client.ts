import type {
  LicenseActivateResult,
  LicensePlatform,
  LicenseStatusResult,
  SignedActivationPayload,
} from "./types";

const REQUEST_TIMEOUT_MS = 15000;

async function postJson<T>(
  origin: string,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; json: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${origin.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function mapApiToResult(json: Record<string, unknown>, fallbackMessage?: string): LicenseStatusResult {
  const state = String(json.state || "INVALID") as LicenseStatusResult["state"];
  const valid = Boolean(json.valid);
  const entitlements =
    json.entitlements && typeof json.entitlements === "object"
      ? (json.entitlements as LicenseStatusResult["entitlements"])
      : undefined;
  return {
    ok: valid,
    state: state === "NETWORK_ERROR" ? "NETWORK_ERROR" : state,
    authorized: valid,
    message: typeof json.message === "string" ? json.message : fallbackMessage,
    clientName: typeof json.clientName === "string" ? json.clientName : undefined,
    licenseType: typeof json.licenseType === "string" ? json.licenseType : undefined,
    expiresAt: typeof json.expiresAt === "string" ? json.expiresAt : undefined,
    devicesActive: typeof json.devicesActive === "number" ? json.devicesActive : undefined,
    maxDevices: typeof json.maxDevices === "number" ? json.maxDevices : undefined,
    licenseId:
      typeof json.signedPayload === "object" &&
      json.signedPayload &&
      "licenseId" in (json.signedPayload as object)
        ? String((json.signedPayload as { licenseId: string }).licenseId)
        : typeof json.licenseId === "string"
          ? json.licenseId
          : undefined,
    deviceId: typeof json.deviceId === "string" ? json.deviceId : undefined,
    platform: json.platform === "macos" || json.platform === "windows" ? json.platform : undefined,
    plan: typeof json.plan === "string" ? json.plan : undefined,
    entitlements,
  };
}

export async function apiActivateLicense(
  origin: string,
  input: { licenseKey: string; deviceId: string; platform: LicensePlatform; appVersion: string },
  fetchImpl: typeof fetch,
): Promise<LicenseActivateResult & { signedPayload?: unknown; signature?: string }> {
  try {
    const { ok, status, json } = await postJson<Record<string, unknown>>(
      origin,
      "/api/license/activate",
      {
        licenseKey: input.licenseKey,
        deviceId: input.deviceId,
        platform: input.platform,
        appVersion: input.appVersion,
      },
      fetchImpl,
    );
    const fallback =
      typeof json.message === "string"
        ? json.message
        : typeof json.error === "string"
          ? json.error
          : "Activation failed.";
    const base = mapApiToResult(json, ok ? undefined : fallback);
    return {
      ...base,
      ok: ok && base.authorized,
      signedPayload: json.signedPayload as SignedActivationPayload | undefined,
      signature: typeof json.signature === "string" ? json.signature : undefined,
    };
  } catch {
    return {
      ok: false,
      state: "NETWORK_ERROR",
      authorized: false,
      message: "Unable to connect to the licensing server. Please check your internet connection.",
    };
  }
}

export async function apiValidateLicense(
  origin: string,
  input: { licenseId: string; deviceId: string; platform: LicensePlatform; appVersion: string },
  fetchImpl: typeof fetch,
): Promise<LicenseActivateResult> {
  try {
    const { ok, json } = await postJson<Record<string, unknown>>(
      origin,
      "/api/license/validate",
      {
        licenseId: input.licenseId,
        deviceId: input.deviceId,
        platform: input.platform,
        appVersion: input.appVersion,
      },
      fetchImpl,
    );
    const base = mapApiToResult(json);
    return {
      ...base,
      ok: ok && base.authorized,
      signedPayload: json.signedPayload as SignedActivationPayload | undefined,
      signature: typeof json.signature === "string" ? json.signature : undefined,
    };
  } catch {
    return {
      ok: false,
      state: "NETWORK_ERROR",
      authorized: false,
      message: "Unable to connect to the licensing server. Please check your internet connection.",
    };
  }
}

export async function apiDeactivateLicense(
  origin: string,
  input: { licenseId: string; deviceId: string },
  fetchImpl: typeof fetch,
): Promise<LicenseStatusResult> {
  try {
    const { ok, json } = await postJson<Record<string, unknown>>(
      origin,
      "/api/license/deactivate",
      input,
      fetchImpl,
    );
    return mapApiToResult(json, ok ? "Device deactivated." : "Deactivation failed.");
  } catch {
    return {
      ok: false,
      state: "NETWORK_ERROR",
      authorized: false,
      message: "Unable to connect to the licensing server. Please check your internet connection.",
    };
  }
}
