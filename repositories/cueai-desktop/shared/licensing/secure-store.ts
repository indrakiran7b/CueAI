import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import type { LocalActivationRecord } from "./types";

const FILE_NAME = "license.activation";

export function licenseStorePath(userDataPath: string) {
  return path.join(userDataPath, FILE_NAME);
}

export function readLicenseRecord(userDataPath: string): LocalActivationRecord | null {
  const file = licenseStorePath(userDataPath);
  try {
    const raw = fs.readFileSync(file);
    const json =
      safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString("utf8");
    return JSON.parse(json) as LocalActivationRecord;
  } catch {
    return null;
  }
}

export function writeLicenseRecord(userDataPath: string, record: LocalActivationRecord) {
  const file = licenseStorePath(userDataPath);
  const payload = JSON.stringify(record);
  const out = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(payload)
    : payload;
  fs.writeFileSync(file, out, safeStorage.isEncryptionAvailable() ? undefined : { encoding: "utf8", mode: 0o600 });
}

export function clearLicenseRecord(userDataPath: string) {
  try {
    fs.unlinkSync(licenseStorePath(userDataPath));
  } catch {
    // ignore
  }
}
