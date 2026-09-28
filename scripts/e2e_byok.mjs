/**
 * Live BYOK smoke: encrypt, store, resolve, list (masked). Uses GROQ_API_KEY from env.
 * Does not print secrets.
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, "apps/web/.env.local") });
process.chdir(path.join(root, "apps/web"));

const groq = process.env.GROQ_API_KEY?.trim();
if (!groq) {
  console.error("SKIP: GROQ_API_KEY not set");
  process.exit(0);
}

const {
  createUserCredential,
  listUserCredentials,
  publicCredential,
  resolveCredential,
  deleteUserCredential,
  probeProviderApiKey,
} = await import("../apps/web/src/lib/server/credential-resolver.ts");
const { encryptSecret, decryptSecret } = await import(
  "../apps/web/src/lib/server/session.ts"
);
const { readStore } = await import("../apps/web/src/lib/server/db.ts");

const enc = encryptSecret(groq);
const dec = decryptSecret(enc);
if (dec !== groq) throw new Error("encrypt/decrypt mismatch");
if (enc.includes(groq)) throw new Error("ciphertext contains plaintext");
console.log("crypto_ok", enc.startsWith("aesgcm."));

const probe = await probeProviderApiKey({ provider: "groq", apiKey: groq });
console.log("probe", probe.ok ? "ok" : "fail");
if (!probe.ok) process.exit(1);

const created = await createUserCredential({
  userId: "usr_byok_e2e",
  workspaceId: "ws_default",
  provider: "groq",
  model: process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant",
  name: "E2E Groq Key",
  apiKey: groq,
  capabilities: ["rag", "live_session", "general_ai"],
  isDefault: true,
});
if ("error" in created) {
  console.error("create_failed", created.error);
  process.exit(1);
}

const pub = publicCredential(created.credential);
const pubJson = JSON.stringify(pub);
if (pubJson.includes(groq) || pubJson.includes("encryptedApiKey")) {
  console.error("FAIL: public payload leaked secret");
  process.exit(1);
}
console.log("public_item", pub.provider, pub.maskedKey, pub.status);

const listed = await listUserCredentials({
  userId: "usr_byok_e2e",
  workspaceId: "ws_default",
});
console.log("listed", listed.length);

const resolved = await resolveCredential({
  userId: "usr_byok_e2e",
  workspaceId: "ws_default",
  capability: "rag",
});
console.log(
  "resolved",
  resolved?.source,
  resolved?.provider,
  Boolean(resolved?.apiKey),
  resolved?.apiKey === groq,
);

const store = await readStore();
const rawStore = JSON.stringify(store.userApiCredentials || []);
if (rawStore.includes(groq)) {
  console.error("FAIL: plaintext key in store JSON");
  process.exit(1);
}
console.log("store_has_plaintext", false);

await deleteUserCredential({
  id: created.credential.id,
  userId: "usr_byok_e2e",
  workspaceId: "ws_default",
});
console.log("BYOK_E2E_OK");
