import { verify } from "node:crypto";
import type { SignedActivationPayload } from "./types";

export function verifySignedActivation(
  payload: SignedActivationPayload,
  signature: string,
  publicKeyPem: string,
): boolean {
  try {
    const key = publicKeyPem.includes("\\n") ? publicKeyPem.replace(/\\n/g, "\n") : publicKeyPem;
    const sigBuf = Buffer.from(signature, "base64");
    if (!sigBuf.length) return false;
    return verify(null, Buffer.from(JSON.stringify(payload)), key, sigBuf);
  } catch {
    return false;
  }
}

export function isPayloadStillValid(payload: SignedActivationPayload, now = Date.now()): boolean {
  if (new Date(payload.expiresAt).getTime() <= now) return false;
  if (new Date(payload.graceUntil).getTime() <= now) return false;
  return true;
}
