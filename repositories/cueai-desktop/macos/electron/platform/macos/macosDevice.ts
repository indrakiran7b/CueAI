import { app, safeStorage } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type MacPublicDevice = {
  deviceId: string;
  maskedId: string;
  deviceName: string;
  platform: "macos";
  appVersion: string;
  keychainAvailable: boolean;
  hasCredential: boolean;
};

export type MacDeviceStatus = "NEW" | "PENDING" | "ACTIVE" | "BLOCKED" | "REVOKED";

export type MacDeviceCheckResult = {
  ok: boolean;
  status: MacDeviceStatus | "NETWORK_ERROR" | "SERVER_ERROR" | "AUTH_REQUIRED";
  authorized: boolean;
  httpStatus?: number;
  message?: string;
};

type StoredIdentity = {
  deviceId: string;
  secret: string;
  credential?: string;
  createdAt: string;
};

const DEVICE_REQUEST_TIMEOUT_MS = 12000;

function identityPath() {
  return path.join(app.getPath("userData"), "device.identity");
}

function maskId(deviceId: string) {
  const tail = deviceId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "----";
  return `MAC-••••••••${tail}`;
}

function deviceName() {
  const host = os.hostname().replace(/\.local$/i, "") || "Mac";
  const user = os.userInfo().username;
  if (user) return `${user}'s Mac`;
  return host;
}

function readIdentity(): StoredIdentity | null {
  try {
    const raw = fs.readFileSync(identityPath());
    if (safeStorage.isEncryptionAvailable()) {
      const json = safeStorage.decryptString(raw);
      return JSON.parse(json) as StoredIdentity;
    }
    return JSON.parse(raw.toString("utf8")) as StoredIdentity;
  } catch {
    return null;
  }
}

function writeIdentity(identity: StoredIdentity) {
  const payload = JSON.stringify(identity);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(identityPath(), safeStorage.encryptString(payload));
    return;
  }
  // Dev-only fallback when Keychain/DPAPI is unavailable. Never used for API keys.
  fs.writeFileSync(identityPath(), payload, { encoding: "utf8", mode: 0o600 });
}

function saveCredential(token: string) {
  const trimmed = token.trim();
  if (trimmed.length < 16 || trimmed.length > 256) {
    throw new Error("CueAI returned an invalid device credential.");
  }
  const identity = getOrCreateMacDeviceIdentity();
  writeIdentity({ ...identity, credential: trimmed });
}

function getCredential() {
  return readIdentity()?.credential || null;
}

export function getOrCreateMacDeviceIdentity(): StoredIdentity {
  const existing = readIdentity();
  if (existing?.deviceId && existing.secret) return existing;

  const identity: StoredIdentity = {
    deviceId: randomUUID(),
    secret: randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  writeIdentity(identity);
  return identity;
}

export function getPublicMacDevice(): MacPublicDevice {
  const identity = getOrCreateMacDeviceIdentity();
  const keychainAvailable = safeStorage.isEncryptionAvailable();
  const hasCredential = Boolean(identity.credential);
  console.log(`[DEVICE] Keychain available = ${keychainAvailable}`);
  if (hasCredential) console.log("[DEVICE] Keychain credential found");
  return {
    deviceId: identity.deviceId,
    maskedId: maskId(identity.deviceId),
    deviceName: deviceName(),
    platform: "macos",
    appVersion: app.getVersion(),
    keychainAvailable,
    hasCredential,
  };
}

type DeviceFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

type SessionFetch = (
  input: string,
  init?: DeviceFetchInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function parseStatus(value: unknown): MacDeviceStatus | null {
  if (value === "NEW" || value === "PENDING" || value === "ACTIVE" || value === "BLOCKED" || value === "REVOKED") {
    return value;
  }
  return null;
}

/** Stable installation identity + Keychain-backed secret for this CueAI Mac. */
export class MacDeviceService {
  getDeviceId() {
    return this.getOrCreateDeviceId();
  }

  getOrCreateDeviceId() {
    return getOrCreateMacDeviceIdentity().deviceId;
  }

  createDeviceId() {
    return getOrCreateMacDeviceIdentity().deviceId;
  }

  getDeviceName() {
    return deviceName();
  }

  getPublicDevice() {
    return getPublicMacDevice();
  }

  getRegistrationState() {
    const identity = readIdentity();
    const keychainAvailable = safeStorage.isEncryptionAvailable();
    return {
      hasIdentity: Boolean(identity?.deviceId && identity.secret),
      hasCredential: Boolean(identity?.credential),
      keychainAvailable,
    };
  }

  getAppVersion() {
    return app.getVersion();
  }

  isKeychainAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  /** Sign-out must not erase the installation identity. */
  clearDeviceSession() {
    const identity = readIdentity();
    if (identity?.credential) {
      writeIdentity({
        deviceId: identity.deviceId,
        secret: identity.secret,
        createdAt: identity.createdAt,
      });
    }
    return { cleared: true, identityPreserved: true };
  }

  async registerDevice(fetchImpl: SessionFetch, origin: string): Promise<MacDeviceCheckResult> {
    const identity = getOrCreateMacDeviceIdentity();
    console.log("[DEVICE] Device ID loaded");
    const timeout = withTimeout(DEVICE_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${origin.replace(/\/$/, "")}/api/devices/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          device_id: identity.deviceId,
          device_name: deviceName(),
          platform: "macos",
          app_version: app.getVersion(),
        }),
        signal: timeout.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        registered?: boolean;
        status?: unknown;
        device_credential?: string;
        error?: string;
      };
      if (res.status === 401) {
        return { ok: false, status: "AUTH_REQUIRED", authorized: false, httpStatus: 401, message: data.error };
      }
      if (res.status === 403) {
        const blocked = /block/i.test(data.error || "");
        return {
          ok: false,
          status: blocked ? "BLOCKED" : "REVOKED",
          authorized: false,
          httpStatus: 403,
          message: data.error,
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status >= 500 ? "SERVER_ERROR" : "SERVER_ERROR",
          authorized: false,
          httpStatus: res.status,
          message: data.error || "Registration failed.",
        };
      }
      const status = parseStatus(data.status);
      if (!data.registered || (status !== "ACTIVE" && status !== "PENDING")) {
        return {
          ok: false,
          status: status || "SERVER_ERROR",
          authorized: false,
          message: data.error || "CueAI did not register this Mac.",
        };
      }
      if (data.device_credential) {
        saveCredential(data.device_credential);
        console.log("[DEVICE] Keychain credential found");
      }
      console.log(`[DEVICE] Status = ${status}`);
      return {
        ok: status === "ACTIVE",
        status,
        authorized: status === "ACTIVE",
        httpStatus: res.status,
      };
    } catch (err) {
      const aborted = err instanceof Error && (err.name === "AbortError" || /aborted|timeout/i.test(err.message));
      return {
        ok: false,
        status: "NETWORK_ERROR",
        authorized: false,
        message: aborted
          ? "Verification timed out. Check your internet connection and try again."
          : "Unable to register this Mac. Check your internet connection and try again.",
      };
    } finally {
      timeout.clear();
    }
  }

  async verifyDevice(fetchImpl: SessionFetch, origin: string): Promise<MacDeviceCheckResult> {
    const identity = getOrCreateMacDeviceIdentity();
    const credential = getCredential();
    console.log("[DEVICE] Device ID loaded");
    if (credential) console.log("[DEVICE] Keychain credential found");
    console.log("[DEVICE] Status request started");
    const timeout = withTimeout(DEVICE_REQUEST_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (credential) headers["X-CueAI-Device-Credential"] = credential;
      const res = await fetchImpl(
        `${origin.replace(/\/$/, "")}/api/devices/status?device_id=${encodeURIComponent(identity.deviceId)}`,
        { method: "GET", headers, signal: timeout.signal },
      );
      const data = (await res.json().catch(() => ({}))) as {
        status?: unknown;
        authorized?: boolean;
        error?: string;
      };
      console.log("[DEVICE] Status response received");
      if (res.status === 401) {
        console.log("[DEVICE] Status = AUTH_REQUIRED");
        return { ok: false, status: "AUTH_REQUIRED", authorized: false, httpStatus: 401, message: data.error };
      }
      if (res.status >= 500) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        return {
          ok: false,
          status: "SERVER_ERROR",
          authorized: false,
          httpStatus: res.status,
          message: data.error || "CueAI could not verify this Mac right now. Try again in a moment.",
        };
      }
      if (!res.ok) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        return {
          ok: false,
          status: "SERVER_ERROR",
          authorized: false,
          httpStatus: res.status,
          message: data.error || "Could not verify this Mac with CueAI.",
        };
      }
      const status = parseStatus(data.status);
      if (!status) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        return { ok: false, status: "SERVER_ERROR", authorized: false, message: "CueAI returned an unknown device status." };
      }
      const authorized = status === "ACTIVE" && data.authorized === true;
      console.log(`[DEVICE] Status = ${status}`);
      console.log(`[DEVICE] authorized = ${authorized}`);
      return { ok: authorized, status, authorized, httpStatus: res.status };
    } catch (err) {
      const aborted = err instanceof Error && (err.name === "AbortError" || /aborted|timeout/i.test(err.message));
      console.log("[DEVICE] Status = NETWORK_ERROR");
      return {
        ok: false,
        status: "NETWORK_ERROR",
        authorized: false,
        message: aborted
          ? "Verification timed out. Check your internet connection and try again."
          : "Unable to verify this Mac. Check your internet connection and try again.",
      };
    } finally {
      timeout.clear();
      console.log("[DEVICE] Device check completed");
    }
  }
}

export const macDeviceService = new MacDeviceService();
