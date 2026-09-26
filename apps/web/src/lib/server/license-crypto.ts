import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";

export type SignedActivationPayload = {
  licenseId: string;
  deviceId: string;
  platform: "windows" | "macos";
  licenseType: string;
  clientName: string;
  expiresAt: string;
  activatedAt: string;
  validatedAt: string;
  graceUntil: string;
};

export function normalizeLicenseKey(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function formatLicenseKey(normalized: string): string {
  const parts = normalized.match(/^CUEAI(CLIENT)?([A-Z0-9]{4,})$/i);
  if (!parts) return normalized;
  const suffix = parts[2] || "";
  const chunks: string[] = [];
  for (let i = 0; i < suffix.length; i += 4) {
    chunks.push(suffix.slice(i, i + 4));
  }
  return `CUEAI-CLIENT-${chunks.join("-")}`;
}

export function hashLicenseKey(raw: string): string {
  const normalized = normalizeLicenseKey(raw);
  return createHash("sha256").update(normalized).digest("hex");
}

export function generateLicenseKey(): string {
  const seg = () => randomBytes(2).toString("hex").toUpperCase();
  return `CUEAI-CLIENT-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export function generateLicenseKeyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function getPrivateKeyPem(): string {
  const pem = process.env.LICENSE_SIGNING_PRIVATE_KEY?.trim();
  if (!pem) {
    throw new Error("LICENSE_SIGNING_PRIVATE_KEY is not configured.");
  }
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

export function getPublicKeyPem(): string {
  const pem = process.env.LICENSE_SIGNING_PUBLIC_KEY?.trim();
  if (!pem) {
    throw new Error("LICENSE_SIGNING_PUBLIC_KEY is not configured.");
  }
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

/** Whether activation signing is configured (does not validate key material). */
export function isLicenseSigningConfigured(): {
  privateKey: boolean;
  publicKey: boolean;
  ready: boolean;
} {
  const privateKey = Boolean(process.env.LICENSE_SIGNING_PRIVATE_KEY?.trim());
  const publicKey = Boolean(process.env.LICENSE_SIGNING_PUBLIC_KEY?.trim());
  return { privateKey, publicKey, ready: privateKey && publicKey };
}

function payloadBytes(payload: SignedActivationPayload) {
  return Buffer.from(JSON.stringify(payload));
}

export function signActivationPayload(payload: SignedActivationPayload): string {
  const privateKey = getPrivateKeyPem();
  return sign(null, payloadBytes(payload), privateKey).toString("base64");
}

export function verifyActivationSignature(
  payload: SignedActivationPayload,
  signature: string,
  publicKeyPem: string,
): boolean {
  try {
    const key = publicKeyPem.includes("\\n") ? publicKeyPem.replace(/\\n/g, "\n") : publicKeyPem;
    const sigBuf = Buffer.from(signature, "base64");
    if (!sigBuf.length) return false;
    return verify(null, payloadBytes(payload), key, sigBuf);
  } catch {
    return false;
  }
}

export function licenseKeysMatch(raw: string, hash: string): boolean {
  const computed = hashLicenseKey(raw);
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
