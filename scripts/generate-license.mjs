#!/usr/bin/env node
/**
 * Server-side license generator. Requires LICENSE_SIGNING_PRIVATE_KEY in env.
 * Never run inside desktop apps or commit generated keys to Git.
 *
 * Usage:
 *   node scripts/generate-license.mjs --client "Acme Corp" --days 30 --devices 2
 */
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = { client: "", days: 30, devices: 2, type: "CLIENT_TESTING", outFile: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--client") out.client = argv[++i] || "";
    else if (a === "--days") out.days = Number(argv[++i] || 30);
    else if (a === "--devices") out.devices = Number(argv[++i] || 2);
    else if (a === "--type") out.type = argv[++i] || "CLIENT_TESTING";
    else if (a === "--out") out.outFile = argv[++i] || "";
    else if (a === "--help") out.help = true;
  }
  return out;
}

function normalizeLicenseKey(raw) {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

function hashLicenseKey(raw) {
  return createHash("sha256").update(normalizeLicenseKey(raw)).digest("hex");
}

function generateLicenseKey() {
  const seg = () => randomBytes(2).toString("hex").toUpperCase();
  return `CUEAI-CLIENT-${seg()}-${seg()}-${seg()}-${seg()}`;
}

function newLicenseId() {
  return `lic_${randomBytes(6).toString("hex")}`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.client) {
    console.log(`Usage: node scripts/generate-license.mjs --client "Client Name" [--days 30] [--devices 2]`);
    process.exit(args.help ? 0 : 1);
  }

  const dataDir = process.env.CUEAI_DATA_DIR?.trim() || path.join(ROOT, "apps", "web", ".data");
  const storePath = path.join(dataDir, "licenses.json");

  let store = { licenses: [], activations: [] };
  try {
    store = JSON.parse(await fs.readFile(storePath, "utf8"));
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }

  const licenseKey = generateLicenseKey();
  const expiresAt = new Date(Date.now() + args.days * 86400_000).toISOString();
  const license = {
    id: newLicenseId(),
    licenseKeyHash: hashLicenseKey(licenseKey),
    licenseType: args.type,
    clientName: args.client.slice(0, 120),
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    expiresAt,
    maxDevices: Math.max(1, Math.min(50, args.devices)),
  };

  store.licenses.push(license);
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");

  console.log("\nCueAI license generated (store only — signing keys unchanged)\n");
  console.log(`Client:     ${license.clientName}`);
  console.log(`Type:       ${license.licenseType}`);
  console.log(`Expires:    ${license.expiresAt.slice(0, 10)}`);
  console.log(`Devices:    ${license.maxDevices}`);
  console.log(`License ID: ${license.id}`);
  console.log(`\nLicense key (copy once — not stored in plaintext):\n\n  ${licenseKey}\n`);
  if (args.outFile) {
    await fs.writeFile(
      args.outFile,
      `${licenseKey}\n\nClient: ${license.clientName}\nExpires: ${license.expiresAt.slice(0, 10)}\nDevices: ${license.maxDevices}\n`,
      "utf8",
    );
    console.log(`Saved to ${args.outFile}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
