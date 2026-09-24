#!/usr/bin/env node
/**
 * Full client handoff pipeline:
 *   1. Cloud server bundle (dist/cueai-server)
 *   2. Windows portable desktop (apps/desktop/windows/release)
 *   3. Test license + client config (dist/client-handoff)
 *
 * Usage:
 *   node scripts/prepare-client-handoff.cjs --client "Acme Corp" --url https://cueai.yourdomain.com
 */
"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "apps", "web");
const HANDOFF = path.join(ROOT, "dist", "client-handoff");
const DESKTOP_RELEASE = path.join(ROOT, "apps", "desktop", "windows", "release");

function parseArgs(argv) {
  const out = { client: "Client Testing", days: 30, devices: 2, url: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--client") out.client = argv[++i] || out.client;
    else if (a === "--days") out.days = Number(argv[++i] || 30);
    else if (a === "--devices") out.devices = Number(argv[++i] || 2);
    else if (a === "--url") out.url = argv[++i] || "";
  }
  return out;
}

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true });
}

function loadEnvLocal() {
  const file = path.join(WEB, ".env.local");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function findPortableExe() {
  if (!fs.existsSync(DESKTOP_RELEASE)) return null;
  const files = fs.readdirSync(DESKTOP_RELEASE);
  const portable = files.find((f) => f.includes("Portable") && f.endsWith(".exe"));
  if (portable) return path.join(DESKTOP_RELEASE, portable);
  const unpacked = path.join(DESKTOP_RELEASE, "win-unpacked", "CueAI.exe");
  if (fs.existsSync(unpacked)) return unpacked;
  return null;
}

const args = parseArgs(process.argv);
const envLocal = loadEnvLocal();
const cloudUrl = (args.url || envLocal.NEXT_PUBLIC_APP_URL || envLocal.AUTH_URL || "https://cueai.yourdomain.com")
  .replace(/\/$/, "")
  .replace("http://localhost:3000", "https://cueai.yourdomain.com")
  .replace("http://127.0.0.1:3000", "https://cueai.yourdomain.com");

const publicKey = envLocal.LICENSE_SIGNING_PUBLIC_KEY || "";
if (!publicKey) {
  console.error("Missing LICENSE_SIGNING_PUBLIC_KEY in apps/web/.env.local — run npm run generate:license-keys");
  process.exit(1);
}

console.log("\n=== CueAI client handoff pipeline ===\n");
console.log(`Cloud URL: ${cloudUrl}`);
console.log(`Client:    ${args.client}\n`);

fs.rmSync(HANDOFF, { recursive: true, force: true });
fs.mkdirSync(HANDOFF, { recursive: true });

run("node scripts/prepare-cloud-deploy.cjs");
run("node scripts/prepare-desktop-web.cjs && npm run dist -w @cueai/desktop");

const licenseKeyPath = path.join(HANDOFF, "LICENSE-KEY.txt");
console.log("\n> Generating license…\n");
run(
  `node scripts/generate-license.mjs --client "${args.client.replace(/"/g, '\\"')}" --days ${args.days} --devices ${args.devices} --out "${licenseKeyPath}"`,
);

const exe = findPortableExe();
if (!exe) {
  console.error("Portable exe not found under apps/desktop/windows/release");
  process.exit(1);
}

const exeName = path.basename(exe);
fs.copyFileSync(exe, path.join(HANDOFF, exeName));

const clientEnv = `# Save as: %APPDATA%\\cueai-desktop\\workspace-data\\.env
CUEAI_WEB_URL=${cloudUrl}
LICENSE_SIGNING_PUBLIC_KEY="${publicKey.replace(/\n/g, "\\n")}"
LICENSE_ENFORCEMENT=true
`;
fs.writeFileSync(path.join(HANDOFF, "cueai-client.env"), clientEnv, "utf8");

fs.copyFileSync(
  path.join(ROOT, "scripts", "launch-client-desktop.ps1"),
  path.join(HANDOFF, "launch-client-desktop.ps1"),
);

const readme = `# CueAI client handoff package

## Files
- ${exeName} — Windows desktop app
- cueai-client.env — remote server config (rename/install as workspace .env)
- launch-client-desktop.ps1 — optional launcher script
- LICENSE-KEY.txt — enter this on the activation screen (fill in after generation)

## Client setup

### Option A — Config file
1. Create folder: %APPDATA%\\cueai-desktop\\workspace-data\\
2. Copy cueai-client.env → rename to .env in that folder
3. Run ${exeName}
4. Enter license key from LICENSE-KEY.txt

### Option B — Launch script
powershell -ExecutionPolicy Bypass -File launch-client-desktop.ps1 \\
  -WebUrl "${cloudUrl}" \\
  -PublicKey "<paste public key from cueai-client.env>" \\
  -ExePath ".\\${exeName}"

## Server URL
${cloudUrl}

Deploy dist/cueai-server/ to your cloud host before the client activates.
`;
fs.writeFileSync(path.join(HANDOFF, "README-CLIENT.txt"), readme, "utf8");

console.log("\n=== Handoff package ready ===\n");
console.log(`  ${HANDOFF}`);
console.log(`  • ${exeName}`);
console.log("  • cueai-client.env");
console.log("  • LICENSE-KEY.txt");
console.log("  • README-CLIENT.txt");
console.log("\nNext:");
console.log(`  1. Deploy dist/cueai-server/ → set AUTH_URL=${cloudUrl}`);
console.log("  2. Zip dist/client-handoff/ and send to client\n");
