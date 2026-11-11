#!/usr/bin/env node
/**
 * Produce CueAI-*.dmg from repositories/cueai-desktop/macos.
 * electron-builder requires macOS (or macos-latest CI).
 */
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const WEB = path.join(ROOT, "repositories", "cueai-web");
const MACOS = path.join(ROOT, "repositories", "cueai-desktop", "macos");
const PREPARE = path.join(ROOT, "repositories", "cueai-desktop", "scripts", "prepare-desktop-web.cjs");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd || ROOT,
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

if (process.platform !== "darwin") {
  console.error(`
CueAI for Mac cannot be packaged on ${process.platform}.

electron-builder only builds .dmg / .app on macOS:
https://www.electron.build/multi-platform-build

On a Mac, from the repo root:

  npm run dist:mac

Or push to GitHub and use the "Mac desktop DMG" workflow (macos-latest).
`);
  process.exit(1);
}

console.log("[dist:mac] Building Next.js (standalone) …");
run(npmCmd, ["run", "build"], { cwd: WEB });

console.log("[dist:mac] Preparing embedded web for Electron …");
run(process.execPath, [PREPARE]);

console.log("[dist:mac] Building CueAI.dmg …");
run(npmCmd, ["run", "dist"], { cwd: MACOS });

console.log(`[dist:mac] Done. See ${path.join(MACOS, "release")}`);
