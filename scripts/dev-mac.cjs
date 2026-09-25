#!/usr/bin/env node
/**
 * CueAI macOS development orchestrator.
 *
 * Starts the Next.js workspace on 127.0.0.1:3002 (unless CUEAI_WEB_URL is set
 * or an existing CueAI server is already there), waits for an HTTP response,
 * then starts Electron. Keep this port in sync with
 * apps/desktop/macos/electron/services/web-server.ts DEV_WEB_ORIGIN.
 */
"use strict";

const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const DEV_WEB_ORIGIN = "http://127.0.0.1:3002";
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
  const result = await httpGet(`${origin}/login?desktop=mac`);
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
            `[WEB] npm run dev:web:mac exited with code ${child.exitCode} before the server was ready`
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

function spawnElectron(origin) {
  const electronBin =
    process.platform === "win32"
      ? path.join(ROOT, "node_modules", "electron", "dist", "electron.exe")
      : path.join(ROOT, "node_modules", ".bin", "electron");
  const child = spawn(electronBin, [".", "--no-sandbox"], {
    cwd: path.join(ROOT, "apps", "desktop", "macos"),
    env: { ...process.env, CUEAI_WEB_URL: origin },
    stdio: "inherit",
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
    if (/:3000$/i.test(origin)) {
      logWeb(
        "Warning: port 3000 is often another Next.js app. CueAI macOS web should be 127.0.0.1:3002 unless you set this on purpose."
      );
    }
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
      `[WEB] Port 3002 is occupied by another application. Stop that process, then run npm run dev:mac again.`
    );
  }

  return { origin: preferred, startWeb: true };
}

async function main() {
  const { origin, startWeb } = await resolveOrigin();
  const loginUrl = `${origin}/login?desktop=mac`;

  let webChild = null;
  if (startWeb) {
    const parsed = new URL(origin);
    logWeb("Starting web server");
    logWeb(`Binding ${parsed.hostname}:${parsed.port || "3002"}`);
    webChild = spawnNpm(["run", "dev:web:mac"], {
      PORT: parsed.port || "3002",
      HOSTNAME: parsed.hostname || "127.0.0.1",
    });
    webChild.on("exit", (code, signal) => {
      if (shuttingDown) return;
      console.error(`[WEB] npm run dev:web:mac exited with code ${code ?? signal ?? 1}`);
    });
  } else {
    logWeb("Web server already running");
  }

  logWeb("Waiting for web server", loginUrl);
  await waitForHttp(loginUrl, { timeoutMs: 90000, child: webChild || undefined });
  logWeb("HTTP probe succeeded");

  const ready = await probeCueAi(origin);
  if (ready.listening && !ready.cueai) {
    throw new Error(
      `[WEB] ${origin} is listening but is not CueAI. Refusing to point Electron at another application.`
    );
  }
  logWeb("Web server ready");

  const overlay = await httpGet("http://127.0.0.1:15175/");
  if (overlay.listening) {
    logElectron("Overlay Vite already listening on 127.0.0.1:15175");
    logElectron("Starting a single-instance Electron helper to focus or recover CueAI");
    logElectron("Renderer URL:", loginUrl);
    const helper = spawnElectron(origin);
    const startedAt = Date.now();
    helper.on("exit", (code, signal) => {
      if (shuttingDown) return;
      const exitCode = code ?? (signal ? 1 : 0);
      if (Date.now() - startedAt < 8000) {
        logElectron("Existing CueAI instance focused; not starting a duplicate");
        return;
      }
      logElectron("Electron process exited", exitCode);
      shutdown(exitCode);
    });
    return;
  }

  logElectron("Starting Electron");
  logElectron("Renderer URL:", loginUrl);
  const desktop = spawnNpm(["run", "dev:desktop:mac"], {
    CUEAI_WEB_URL: origin,
  });
  desktop.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    logElectron("vite/npm process exited", exitCode);
    // vite-plugin-electron on Windows can kill the npm wrapper while Electron
    // stays alive. Keep the web server up so a reload still works.
    if (process.platform === "win32" && exitCode === 1 && webChild) {
      logElectron("Wrapper exited; keeping the web server until this terminal is stopped");
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
