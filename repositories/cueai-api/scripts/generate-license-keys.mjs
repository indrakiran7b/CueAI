#!/usr/bin/env node
/**
 * Generate Ed25519 keypair for license activation signing.
 * Keep LICENSE_SIGNING_PRIVATE_KEY server-side only.
 * LICENSE_SIGNING_PUBLIC_KEY may be embedded in desktop builds.
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

console.log("Add to server .env.local (never commit):\n");
console.log(`LICENSE_SIGNING_PRIVATE_KEY="${privateKey.trim().replace(/\n/g, "\\n")}"`);
console.log("\nAdd to desktop packaging env / CI (public only):\n");
console.log(`LICENSE_SIGNING_PUBLIC_KEY="${publicKey.trim().replace(/\n/g, "\\n")}"`);
