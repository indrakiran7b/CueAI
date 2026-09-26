import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type LicenseType = "CLIENT_TESTING" | "PRO" | "BUSINESS" | "ENTERPRISE" | "FREE";
export type LicenseStatus = "ACTIVE" | "REVOKED";
export type LicenseActivationStatus = "ACTIVE" | "DEACTIVATED";

export type DbLicense = {
  id: string;
  licenseKeyHash: string;
  licenseType: LicenseType;
  clientName: string;
  status: LicenseStatus;
  createdAt: string;
  expiresAt: string;
  maxDevices: number;
  metadata?: Record<string, string | number | boolean>;
};

export type DbLicenseActivation = {
  id: string;
  licenseId: string;
  deviceId: string;
  platform: "windows" | "macos";
  appVersion: string;
  activatedAt: string;
  lastSeenAt: string;
  deactivatedAt?: string;
  status: LicenseActivationStatus;
  metadata?: Record<string, string | number | boolean>;
};

/** Encrypted Keygate license-key binding for device (server-side only). */
export type DbKeygateBinding = {
  id: string;
  licenseId: string;
  deviceId: string;
  platform: "windows" | "macos";
  /** encryptSecret(licenseKey) — never log or return raw */
  licenseKeyEnc: string;
  planName?: string;
  planId?: string;
  features?: Record<string, unknown>;
  clientName?: string;
  expiresAt?: string;
  activatedAt: string;
  lastSeenAt: string;
  deactivatedAt?: string;
  status: LicenseActivationStatus;
};

export type LicenseStore = {
  licenses: DbLicense[];
  activations: DbLicenseActivation[];
  keygateBindings: DbKeygateBinding[];
};

const DATA_DIR = process.env.CUEAI_DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "licenses.json");

let memory: LicenseStore | null = null;
let loadedMtimeMs = 0;
let writeQueue: Promise<void> = Promise.resolve();

function defaultStore(): LicenseStore {
  return { licenses: [], activations: [], keygateBindings: [] };
}

async function storeFileMtime(): Promise<number> {
  try {
    const st = await fs.stat(STORE_PATH);
    return st.mtimeMs;
  } catch {
    return 0;
  }
}

async function persist(store: LicenseStore) {
  memory = store;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
    loadedMtimeMs = await storeFileMtime();
  });
  await writeQueue;
}

async function ensureLoaded(): Promise<LicenseStore> {
  const mtime = await storeFileMtime();
  if (memory && mtime && loadedMtimeMs && mtime <= loadedMtimeMs) {
    return memory;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STORE_PATH, "utf8");
    memory = JSON.parse(raw) as LicenseStore;
    loadedMtimeMs = mtime || Date.now();
    if (!memory.licenses) memory.licenses = [];
    if (!memory.activations) memory.activations = [];
    if (!memory.keygateBindings) memory.keygateBindings = [];
    return memory;
  } catch {
    memory = defaultStore();
    await persist(memory);
    return memory;
  }
}

export async function readLicenseStore() {
  return ensureLoaded();
}

export async function updateLicenseStore(mutator: (store: LicenseStore) => void | Promise<void>) {
  const store = await ensureLoaded();
  await mutator(store);
  await persist(store);
  return store;
}

export function newLicenseId() {
  return `lic_${randomUUID().slice(0, 12)}`;
}

export function newActivationId() {
  return `lact_${randomUUID().slice(0, 12)}`;
}

export function newKeygateBindingId() {
  return `kgb_${randomUUID().slice(0, 12)}`;
}

/** Test helper — reset in-memory cache between isolated runs. */
export function invalidateLicenseStoreCache() {
  memory = null;
  loadedMtimeMs = 0;
}
