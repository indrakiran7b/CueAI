#!/usr/bin/env node
/**
 * Bundle Next.js standalone output for cloud/VPS deployment.
 * Output: dist/cueai-server/
 */
"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "apps", "web");
const OUT = path.join(ROOT, "dist", "cueai-server");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

console.log("\n=== Prepare cloud server bundle ===\n");
run("npm run build:web");

const standaloneRoot = path.join(WEB, ".next", "standalone");
const nested = [
  path.join(standaloneRoot, "web"),
  path.join(standaloneRoot, "apps", "web"),
].find((p) => fs.existsSync(path.join(p, "server.js")));
const serverDir = nested || standaloneRoot;

if (!fs.existsSync(path.join(serverDir, "server.js"))) {
  throw new Error("Missing server.js — run npm run build:web first");
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(serverDir, OUT);
copyDir(path.join(WEB, ".next", "static"), path.join(OUT, ".next", "static"));
if (fs.existsSync(path.join(WEB, "public"))) {
  copyDir(path.join(WEB, "public"), path.join(OUT, "public"));
}

// Never copy values from apps/web/.env.local — dist/ may be zipped and shared.
const exampleEnv = `# Production env for dist/cueai-server — set on your cloud host
PORT=3000
HOSTNAME=0.0.0.0
NODE_ENV=production

# Required — replace with your public HTTPS URL
AUTH_URL=https://cueai.yourdomain.com
NEXT_PUBLIC_APP_URL=https://cueai.yourdomain.com

# Required — generate: npm run generate:license-keys
AUTH_SECRET=CHANGE_ME_USE_openssl_rand_base64_32
LICENSE_SIGNING_PRIVATE_KEY=
LICENSE_SIGNING_PUBLIC_KEY=
LICENSE_OFFLINE_GRACE_HOURS=72

# Persistent data (mount a volume here in production)
CUEAI_DATA_DIR=/var/cueai/data

# AI keys (server-side only)
GROQ_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GROQ_MODEL=openai/gpt-oss-20b
`;

fs.writeFileSync(path.join(OUT, ".env.production.example"), exampleEnv, "utf8");

const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
RUN mkdir -p /var/cueai/data
VOLUME ["/var/cueai/data"]
CMD ["node", "server.js"]
`;
fs.writeFileSync(path.join(OUT, "Dockerfile"), dockerfile, "utf8");

const startSh = `#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p "\${CUEAI_DATA_DIR:-./data}"
export HOSTNAME="\${HOSTNAME:-0.0.0.0}"
export PORT="\${PORT:-3000}"
exec node server.js
`;
fs.writeFileSync(path.join(OUT, "start.sh"), startSh, "utf8");

const localData = path.join(WEB, ".data", "licenses.json");
const seedDir = path.join(OUT, "seed-data");
if (fs.existsSync(localData)) {
  fs.mkdirSync(seedDir, { recursive: true });
  fs.copyFileSync(localData, path.join(seedDir, "licenses.json"));
  fs.writeFileSync(
    path.join(seedDir, "README.txt"),
    "On first deploy, copy licenses.json into CUEAI_DATA_DIR on the server so pre-generated keys validate.\n",
    "utf8",
  );
}

console.log(`\n✓ Server bundle: ${OUT}`);
console.log("  Upload dist/cueai-server/ to your VPS or build Docker image from that folder.");
console.log("  Set env vars from .env.production.example, mount CUEAI_DATA_DIR, enable HTTPS.");
if (fs.existsSync(localData)) {
  console.log("  Copy seed-data/licenses.json → $CUEAI_DATA_DIR/licenses.json on first deploy.\n");
} else {
  console.log("");
}
