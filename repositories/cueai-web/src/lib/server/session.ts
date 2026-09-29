import {
  createHmac,
  timingSafeEqual,
  scryptSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import type { WorkspaceRole } from "@/lib/roles";
import { normalizeRole } from "@/lib/roles";

export const SESSION_COOKIE = "cueai_admin_session";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  workspaceId: string;
  workspace: string;
  exp: number;
};

function secret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "cueai-dev-secret-change-me";
}

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

export function signSession(payload: Omit<SessionPayload, "exp">, ttlSeconds = 60 * 60 * 24 * 14) {
  const body: SessionPayload = {
    ...payload,
    role: normalizeRole(payload.role),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = b64url(JSON.stringify(body));
  const sig = b64url(createHmac("sha256", secret()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(data).toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    payload.role = normalizeRole(payload.role);
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(next, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 32-byte AES key from CUEAI_SECRET_ENCRYPTION_KEY or AUTH_SECRET. */
function vaultKey(): Buffer {
  const explicit = process.env.CUEAI_SECRET_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) return Buffer.from(explicit, "hex");
    return createHmac("sha256", "cueai-vault-v1").update(explicit).digest();
  }
  return createHmac("sha256", secret()).update("cueai-secret-key-v2-aes").digest();
}

/**
 * Encrypt a secret with AES-256-GCM (authenticated).
 * Format: aesgcm.<iv>.<ciphertext>.<tag> (base64url parts).
 * Legacy XOR format (iv.data) remains decryptable for older admin keys.
 */
export function encryptSecret(value: string) {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aesgcm.${b64url(iv)}.${b64url(encrypted)}.${b64url(tag)}`;
}

export function decryptSecret(value: string) {
  if (!value) return "";
  if (value.startsWith("aesgcm.")) {
    const parts = value.split(".");
    if (parts.length !== 4) return "";
    const [, ivPart, dataPart, tagPart] = parts;
    if (!ivPart || !dataPart || !tagPart) return "";
    try {
      const decipher = createDecipheriv("aes-256-gcm", vaultKey(), fromB64url(ivPart));
      decipher.setAuthTag(fromB64url(tagPart));
      const out = Buffer.concat([
        decipher.update(fromB64url(dataPart)),
        decipher.final(),
      ]);
      return out.toString("utf8");
    } catch {
      return "";
    }
  }

  // Legacy XOR stream (admin provider keys written before AES upgrade).
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) return "";
  const key = createHmac("sha256", secret()).update("cueai-secret-key").digest();
  const input = fromB64url(dataPart);
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i]! ^ key[i % key.length]!;
  }
  return out.toString("utf8");
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export function keyLast4(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(-4);
}

export function maskKeyLast4(last4: string): string {
  if (!last4) return "••••••••";
  return `••••••••${last4}`;
}

export function sessionCookieOptions(maxAge = 60 * 60 * 24 * 14) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
