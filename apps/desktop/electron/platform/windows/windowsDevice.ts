import { app, safeStorage } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Account-device identity for Windows. Separate from license.device.
 * Stored as account.device.identity under userData, encrypted with DPAPI
 * via Electron safeStorage when available.
 */
export type WindowsPublicDevice = {
  deviceId: string;
  maskedId: string;
  deviceName: string;
  platform: "windows";
  appVersion: string;
  keychainAvailable: boolean;
  hasCredential: boolean;
};

export type WindowsDeviceStatus = "NEW" | "PENDING" | "ACTIVE" | "BLOCKED" | "REVOKED";

export type WindowsDeviceCheckResult = {
  ok: boolean;
  status: WindowsDeviceStatus | "NETWORK_ERROR" | "SERVER_ERROR" | "AUTH_REQUIRED";
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
const ACCOUNT_DEVICE_FILE = "account.device.identity";

function identityPath() {
  return path.join(app.getPath("userData"), ACCOUNT_DEVICE_FILE);
}

function maskId(deviceId: string) {
  const tail = deviceId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "----";
  return `WIN-••••••••${tail}`;
}

function deviceName() {
  const host = os.hostname() || "Windows";
  const user = os.userInfo().username;
  if (user) return `${user}'s Windows`;
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
  fs.writeFileSync(identityPath(), payload, { encoding: "utf8", mode: 0o600 });
}

function saveCredential(token: string) {
  const trimmed = token.trim();
  if (trimmed.length < 16 || trimmed.length > 256) {
    throw new Error("CueAI returned an invalid device credential.");
  }
  const identity = getOrCreateWindowsDeviceIdentity();
  writeIdentity({ ...identity, credential: trimmed });
}

function getCredential() {
  return readIdentity()?.credential || null;
}

export function getDeviceAuthHeaders(): Record<string, string> {
  const identity = readIdentity();
  const deviceId = identity?.deviceId?.trim() || "";
  const credential = identity?.credential?.trim() || "";
  if (!deviceId || !credential) return {};
  return {
    "X-CueAI-Device-Id": deviceId,
    "X-CueAI-Device-Credential": credential,
  };
}

export function getOrCreateWindowsDeviceIdentity(): StoredIdentity {
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

export function getPublicWindowsDevice(): WindowsPublicDevice {
  const identity = getOrCreateWindowsDeviceIdentity();
  const keychainAvailable = safeStorage.isEncryptionAvailable();
  const hasCredential = Boolean(identity.credential);
  console.log(`[DEVICE] process.platform = ${process.platform}`);
  console.log("[DEVICE] implementation = windows");
  console.log(`[DEVICE] device identity available = ${Boolean(identity.deviceId)}`);
  console.log(`[DEVICE] credential available = ${hasCredential}`);
  console.log(`[DEVICE] DPAPI available = ${keychainAvailable}`);
  if (hasCredential) console.log("[DEVICE] Account-device credential found");
  return {
    deviceId: identity.deviceId,
    maskedId: maskId(identity.deviceId),
    deviceName: deviceName(),
    platform: "windows",
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

function parseStatus(value: unknown): WindowsDeviceStatus | null {
  if (value === "NEW" || value === "PENDING" || value === "ACTIVE" || value === "BLOCKED" || value === "REVOKED") {
    return value;
  }
  return null;
}

export class WindowsDeviceService {
  getDeviceId() {
    return getOrCreateWindowsDeviceIdentity().deviceId;
  }

  getPublicDevice() {
    return getPublicWindowsDevice();
  }

  getAuthHeaders() {
    return getDeviceAuthHeaders();
  }

  getRegistrationState() {
    const identity = readIdentity();
    return {
      hasIdentity: Boolean(identity?.deviceId && identity.secret),
      hasCredential: Boolean(identity?.credential),
      keychainAvailable: safeStorage.isEncryptionAvailable(),
      storageFile: ACCOUNT_DEVICE_FILE,
    };
  }

  saveIssuedCredential(token: string) {
    saveCredential(token);
    return { saved: true };
  }

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

  async registerDevice(fetchImpl: SessionFetch, origin: string): Promise<WindowsDeviceCheckResult> {
    const identity = getOrCreateWindowsDeviceIdentity();
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
          platform: "windows",
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
          status: "SERVER_ERROR",
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
          message: data.error || "CueAI did not register this device.",
        };
      }
      if (data.device_credential) {
        saveCredential(data.device_credential);
      }
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
          : "Unable to register this device. Check your internet connection and try again.",
      };
    } finally {
      timeout.clear();
    }
  }

  async verifyDevice(fetchImpl: SessionFetch, origin: string): Promise<WindowsDeviceCheckResult> {
    const identity = getOrCreateWindowsDeviceIdentity();
    const credential = getCredential();
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
      if (res.status === 401) {
        return { ok: false, status: "AUTH_REQUIRED", authorized: false, httpStatus: 401, message: data.error };
      }
      if (!res.ok) {
        return {
          ok: false,
          status: "SERVER_ERROR",
          authorized: false,
          httpStatus: res.status,
          message: data.error || "Could not verify this device with CueAI.",
        };
      }
      const status = parseStatus(data.status);
      if (!status) {
        return { ok: false, status: "SERVER_ERROR", authorized: false, message: "CueAI returned an unknown device status." };
      }
      const authorized = status === "ACTIVE" && data.authorized === true;
      return { ok: authorized, status, authorized, httpStatus: res.status };
    } catch (err) {
      const aborted = err instanceof Error && (err.name === "AbortError" || /aborted|timeout/i.test(err.message));
      return {
        ok: false,
        status: "NETWORK_ERROR",
        authorized: false,
        message: aborted
          ? "Verification timed out. Check your internet connection and try again."
          : "Unable to verify this device. Check your internet connection and try again.",
      };
    } finally {
      timeout.clear();
    }
  }
}

export const windowsDeviceService = new WindowsDeviceService();
