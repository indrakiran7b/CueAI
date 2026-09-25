#!/usr/bin/env node
/**
 * CueAI Windows development orchestrator.
 *
 * One command starts the Next.js workspace on 127.0.0.1:3000 (unless CUEAI_WEB_URL
 * is set or CueAI is already listening), waits for HTTP, then starts Electron.
 *
 * Usage: npm run dev:desktop
 */
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, "apps/web/.env.local"));
loadEnvFile(path.join(ROOT, "apps/web/.env"));
const DEV_WEB_ORIGIN = "http://127.0.0.1:3000";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const children = [];
let shuttingDown = false;

function logWeb(...args) {
  console.log("[WEB]", ...args);
}

function logElectron(...args) {
  console.log("[ELECTRON]", ...args);
}

function normalizeOrigin(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/$/, "");
}

function originFromEnv() {
  const raw = process.env.CUEAI_WEB_URL?.trim();
  return raw ? normalizeOrigin(raw) : DEV_WEB_ORIGIN;
}

function httpGet(url) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = http.get(url, { timeout: 2500 }, (res) => {
      const chunks = [];
      const done = () => {
        req.destroy();
        finish({
          listening: true,
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      };
      res.on("data", (chunk) => {
        chunks.push(chunk);
        if (chunks.reduce((n, c) => n + c.length, 0) > 8000) done();
      });
      res.on("end", done);
      res.on("close", done);
      res.on("error", done);
    });
    req.on("error", (err) => finish({ listening: false, error: err }));
    req.on("timeout", () => {
      req.destroy();
      finish({ listening: false, error: new Error("timeout") });
    });
  });
}

function looksLikeCueAi(body) {
  return /CueAI/i.test(body || "");
}

async function probeCueAi(origin) {
  const result = await httpGet(`${origin}/license?desktop=windows`);
  if (!result.listening) return { listening: false, cueai: false, error: result.error };
  return {
    listening: true,
    cueai: looksLikeCueAi(result.body),
    status: result.status,
  };
}

function waitForHttp(url, { timeoutMs, child } = {}) {
  const started = Date.now();
  const limit = timeoutMs ?? 90000;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (child && child.exitCode !== null) {
        reject(
          new Error(
            `[WEB] npm run dev:web exited with code ${child.exitCode} before the server was ready`
          )
        );
        return;
      }
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > limit) {
          reject(
            new Error(
              `[WEB] Web server did not become ready at ${url} within ${Math.round(limit / 1000)}s`
            )
          );
          return;
        }
        setTimeout(tick, 250);
      });
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() - started > limit) {
          reject(new Error(`[WEB] Web server did not become ready at ${url}`));
          return;
        }
        setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function spawnNpm(args, extraEnv) {
  const command = [npmCmd, ...args]
    .map((part) => (/\s/.test(part) ? `"${part}"` : part))
    .join(" ");
  const child = spawn(command, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: true,
    windowsHide: process.platform === "win32",
  });
  children.push(child);
  return child;
}

function killChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killChild(child);
  setTimeout(() => process.exit(code ?? 0), 400);
}

async function resolveOrigin() {
  if (process.env.CUEAI_WEB_URL?.trim()) {
    const origin = originFromEnv();
    logWeb("Using CUEAI_WEB_URL", origin);
    return { origin, startWeb: false };
  }

  const preferred = DEV_WEB_ORIGIN;
  const onPreferred = await probeCueAi(preferred);
  if (onPreferred.listening && onPreferred.cueai) {
    logWeb("Reusing CueAI web server already listening at", preferred);
    return { origin: preferred, startWeb: false };
  }

  if (onPreferred.listening && !onPreferred.cueai) {
    throw new Error(
      `[WEB] Port 3000 is occupied by another application. Stop that process, then run npm run dev:desktop again.`
    );
  }

  return { origin: preferred, startWeb: true };
}

async function main() {
  const { origin, startWeb } = await resolveOrigin();
  const entryUrl = `${origin}/license?desktop=windows`;

  let webChild = null;
  if (startWeb) {
    const parsed = new URL(origin);
    logWeb("Starting embedded web server for desktop");
    logWeb(`Binding ${parsed.hostname}:${parsed.port || "3000"}`);
    // Use dev:web:desktop — nested `npm run dev:web -- --port` breaks on Windows
    // (args become `next dev 3000 127.0.0.1` instead of --port/--hostname).
    webChild = spawnNpm(["run", "dev:web:desktop"], {
      PORT: parsed.port || "3000",
      HOSTNAME: parsed.hostname || "127.0.0.1",
    });
    webChild.on("exit", (code, signal) => {
      if (shuttingDown) return;
      console.error(`[WEB] npm run dev:web exited with code ${code ?? signal ?? 1}`);
    });
  } else {
    logWeb("Web server already running");
  }

  logWeb("Waiting for web server", entryUrl);
  await waitForHttp(entryUrl, { timeoutMs: 90000, child: webChild || undefined });
  logWeb("HTTP probe succeeded");

  const ready = await probeCueAi(origin);
  if (ready.listening && !ready.cueai) {
    throw new Error(
      `[WEB] ${origin} is listening but is not CueAI. Refusing to point Electron at another application.`
    );
  }
  logWeb("Web server ready");

  logElectron("Starting Windows desktop (Electron + companion)");
  logElectron("Renderer URL:", entryUrl);
  const desktopEnv = { CUEAI_WEB_URL: origin };
  if (process.env.LICENSE_SIGNING_PUBLIC_KEY?.trim()) {
    desktopEnv.LICENSE_SIGNING_PUBLIC_KEY = process.env.LICENSE_SIGNING_PUBLIC_KEY;
  }
  if (process.env.LICENSE_ENFORCEMENT?.trim()) {
    desktopEnv.LICENSE_ENFORCEMENT = process.env.LICENSE_ENFORCEMENT;
  }
  const desktop = spawnNpm(["run", "dev:desktop:electron"], desktopEnv);
  desktop.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    logElectron("Desktop process exited", exitCode);
    if (process.platform === "win32" && exitCode === 1 && webChild) {
      logElectron("Keeping the web server running until this terminal is stopped");
      return;
    }
    shutdown(exitCode);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (err) => {
  console.error("[WEB] uncaughtException", err);
  shutdown(1);
});
process.on("unhandledRejection", (err) => {
  console.error("[WEB] unhandledRejection", err);
  shutdown(1);
});
process.on("exit", () => {
  if (!shuttingDown) {
    for (const child of children) killChild(child);
  }
});

if (!process.stdin.isTTY) {
  process.stdin.resume();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
