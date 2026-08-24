import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/** Loopback port for the embedded Next.js server inside packaged builds. */
export const EMBEDDED_WEB_PORT = 39100;

let child: ChildProcess | null = null;
let webOrigin: string | null = null;
let lastSpawnError = "";

function packagedWebRoot() {
  return path.join(process.resourcesPath, "web");
}

function waitForServer(url: string, timeoutMs = 45000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (child && child.exitCode !== null) {
        reject(
          new Error(
            `Embedded web server exited early (code ${child.exitCode}). ${lastSpawnError}`.trim()
          )
        );
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(
            new Error(
              `Embedded web server did not start at ${url}. ${lastSpawnError}`.trim()
            )
          );
          return;
        }
        setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function buildChildEnv(root: string): NodeJS.ProcessEnv {
  const modulesDir = path.join(root, "standalone_modules");
  const legacyModules = path.join(root, "node_modules");
  const nodePathParts = [modulesDir, legacyModules].filter((p) => fs.existsSync(p));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(EMBEDDED_WEB_PORT),
    HOSTNAME: "127.0.0.1",
    AUTH_SECRET: process.env.AUTH_SECRET || "cueai-desktop-test-secret-change-me",
    AUTH_URL: `http://127.0.0.1:${EMBEDDED_WEB_PORT}`,
    NEXT_PUBLIC_SKIP_AUTH: "true",
  };

  if (nodePathParts.length > 0) {
    const existing = env.NODE_PATH ? String(env.NODE_PATH).split(path.delimiter) : [];
    env.NODE_PATH = [...nodePathParts, ...existing].join(path.delimiter);
  }

  return env;
}

/**
 * Dev → localhost:3000 (or CUEAI_WEB_URL).
 * Packaged → spawn Next standalone with Electron-as-Node.
 */
export async function startEmbeddedWebServer(): Promise<string> {
  if (webOrigin) return webOrigin;

  const envUrl = process.env.CUEAI_WEB_URL?.trim();
  if (envUrl) {
    webOrigin = envUrl.replace(/\/$/, "");
    return webOrigin;
  }

  if (!app.isPackaged) {
    webOrigin = "http://127.0.0.1:3000";
    return webOrigin;
  }

  const root = packagedWebRoot();
  const serverJs = path.join(root, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Missing packaged web server at ${serverJs}`);
  }

  const modulesDir = path.join(root, "standalone_modules");
  if (!fs.existsSync(path.join(modulesDir, "next")) && !fs.existsSync(path.join(root, "node_modules", "next"))) {
    throw new Error(
      `Missing Next.js runtime under ${modulesDir}. Rebuild with prepare-desktop-web.cjs.`
    );
  }

  lastSpawnError = "";
  child = spawn(process.execPath, [serverJs], {
    cwd: root,
    env: buildChildEnv(root),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (buf) => {
    const line = String(buf).trimEnd();
    console.log(`[web] ${line}`);
  });
  child.stderr?.on("data", (buf) => {
    const line = String(buf).trimEnd();
    lastSpawnError = line;
    console.error(`[web] ${line}`);
  });
  child.on("error", (err) => {
    lastSpawnError = err.message;
    console.error("[web] spawn error", err);
  });
  child.on("exit", (code) => {
    console.log(`[web] embedded server exited (${code})`);
    child = null;
  });

  webOrigin = `http://127.0.0.1:${EMBEDDED_WEB_PORT}`;
  await waitForServer(webOrigin);
  return webOrigin;
}

export function getWebOrigin() {
  return webOrigin || process.env.CUEAI_WEB_URL || "http://127.0.0.1:3000";
}

export function stopEmbeddedWebServer() {
  if (!child || child.killed) {
    child = null;
    return;
  }
  try {
    child.kill();
  } catch {
    // ignore
  }
  child = null;
}
