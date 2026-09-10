#!/usr/bin/env node
/**
 * Bundles the Next.js standalone web app into apps/desktop/build-resources/web
 * for embedding inside the packaged Electron desktop build.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const webRoot = path.join(root, "apps", "web");
const desktopRoot = path.join(root, "apps", "desktop");
const outDir = path.join(desktopRoot, "build-resources", "web");
const standaloneRoot = path.join(webRoot, ".next", "standalone");
const standaloneApp = path.join(standaloneRoot, "apps", "web");
const staticSrc = path.join(webRoot, ".next", "static");
const publicSrc = path.join(webRoot, "public");

function runNpm(args, env = {}) {
  const result = spawnSync("npm", args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

console.log("[prepare-desktop-web] Building Next.js standalone…");
runNpm(["run", "build:web"], {
  NEXT_PUBLIC_SKIP_AUTH: "true",
  AUTH_URL: "http://127.0.0.1:39100",
});

if (!fs.existsSync(path.join(standaloneApp, "server.js"))) {
  console.error(
    `[prepare-desktop-web] Missing ${path.join(standaloneApp, "server.js")}. ` +
      "Ensure apps/web next.config.ts has output: 'standalone'."
  );
  process.exit(1);
}

console.log("[prepare-desktop-web] Copying standalone bundle…");
rmDir(outDir);
fs.mkdirSync(outDir, { recursive: true });

for (const name of fs.readdirSync(standaloneApp)) {
  const from = path.join(standaloneApp, name);
  const to = path.join(outDir, name);
  if (fs.statSync(from).isDirectory()) copyDir(from, to);
  else fs.copyFileSync(from, to);
}

const modulesSrc = path.join(standaloneRoot, "node_modules");
const modulesDest = path.join(outDir, "standalone_modules");
if (fs.existsSync(modulesSrc)) {
  console.log("[prepare-desktop-web] Copying runtime modules…");
  copyDir(modulesSrc, modulesDest);
}

const staticDest = path.join(outDir, ".next", "static");
if (fs.existsSync(staticSrc)) {
  console.log("[prepare-desktop-web] Copying static assets…");
  copyDir(staticSrc, staticDest);
}

if (fs.existsSync(publicSrc)) {
  console.log("[prepare-desktop-web] Copying public assets…");
  copyDir(publicSrc, path.join(outDir, "public"));
}

console.log(`[prepare-desktop-web] Ready at ${outDir}`);
