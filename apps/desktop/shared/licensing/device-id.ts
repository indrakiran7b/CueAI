import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";

type DeviceIdentity = {
  deviceId: string;
  createdAt: string;
};

const FILE_NAME = "license.device";

function identityPath(userDataPath: string) {
  return path.join(userDataPath, FILE_NAME);
}

function readIdentity(userDataPath: string): DeviceIdentity | null {
  try {
    const raw = fs.readFileSync(identityPath(userDataPath));
    const json =
      safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString("utf8");
    return JSON.parse(json) as DeviceIdentity;
  } catch {
    return null;
  }
}

function writeIdentity(userDataPath: string, identity: DeviceIdentity) {
  const payload = JSON.stringify(identity);
  const out = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(payload)
    : payload;
  fs.writeFileSync(
    identityPath(userDataPath),
    out,
    safeStorage.isEncryptionAvailable() ? undefined : { encoding: "utf8", mode: 0o600 },
  );
}

export function getOrCreateDeviceId(userDataPath: string): string {
  const existing = readIdentity(userDataPath);
  if (existing?.deviceId) return existing.deviceId;
  const identity: DeviceIdentity = {
    deviceId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  writeIdentity(userDataPath, identity);
  return identity.deviceId;
}

export function deviceDisplayName(platform: "windows" | "macos") {
  const host = os.hostname().replace(/\.local$/i, "") || (platform === "macos" ? "Mac" : "PC");
  const user = os.userInfo().username;
  if (user) return platform === "macos" ? `${user}'s Mac` : `${user}'s PC`;
  return host;
}

export function maskDeviceId(deviceId: string, platform: "windows" | "macos") {
  const tail = deviceId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "----";
  const prefix = platform === "macos" ? "MAC" : "WIN";
  return `${prefix}-••••••••${tail}`;
}
