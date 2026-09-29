/**
 * Edge-compatible session verify (Web Crypto). Used by middleware.
 * Keep in sync with signSession() in session.ts (HMAC-SHA256 over base64url payload).
 */

export const SESSION_COOKIE = "cueai_admin_session";

export type EdgeSessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: string;
  workspaceId: string;
  workspace: string;
  exp: number;
};

function secret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "cueai-dev-secret-change-me";
}

function b64urlFromBytes(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function bytesFromB64url(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  return diff === 0;
}

async function hmacSign(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlFromBytes(sig);
}

export async function verifySessionEdge(
  token: string | undefined | null,
): Promise<EdgeSessionPayload | null> {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = await hmacSign(data);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const json = new TextDecoder().decode(bytesFromB64url(data));
    const payload = JSON.parse(json) as EdgeSessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function canAccessAdminRole(role?: string | null) {
  return role === "Admin" || role === "Manager";
}

export function canAccessResumeTailorRole(role?: string | null) {
  return role === "Admin" || role === "Manager" || role === "User";
}
