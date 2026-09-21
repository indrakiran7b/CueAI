import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/** Loopback port for the embedded Next.js server inside packaged builds. */
export const EMBEDDED_WEB_PORT = 39100;

/**
 * Development renderer origin. Keep in sync with scripts/dev-mac.cjs.
 * Packaged builds never use this — they spawn standalone Next on EMBEDDED_WEB_PORT.
 */
export const DEV_WEB_ORIGIN = "http://127.0.0.1:3002";

let child: ChildProcess | null = null;
let webOrigin: string | null = null;
let lastSpawnError = "";

function packagedWebRoot() {
  return path.join(process.resourcesPath, "web");
}

export function normalizeWebOrigin(raw: string) {
  return raw.trim().replace(/\/$/, "");
}

export function waitForWebServer(url: string, timeoutMs = 45000): Promise<void> {
  const started = Date.now();
  const target = normalizeWebOrigin(url);
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
      const req = http.get(target, { timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(
            new Error(
              `Web server did not start at ${target}. ${lastSpawnError}`.trim()
            )
          );
          return;
        }
        setTimeout(tick, 250);
      });
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Web server did not start at ${target}.`.trim()));
          return;
        }
        setTimeout(tick, 250);
      });
    };
    tick();
  });
}

/**
 * Packaged builds ship no .env.local, so API keys (GEMINI_API_KEY, GROQ_API_KEY)
 * are read from a plain KEY=VALUE file next to the workspace store. That keeps
 * secrets in the user's app data instead of baked into the executable, and lets
 * testers swap keys without a rebuild.
 */
function readDataDirEnv(dataDir: string): NodeJS.ProcessEnv {
  const file = path.join(dataDir, ".env");
  const loaded: NodeJS.ProcessEnv = {};
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return loaded;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value) loaded[key] = value;
  }

  const names = Object.keys(loaded);
  if (names.length > 0) console.log(`[web] loaded ${names.length} var(s) from ${file}`);
  return loaded;
}

function buildChildEnv(root: string): NodeJS.ProcessEnv {
  const modulesDir = path.join(root, "standalone_modules");
  const legacyModules = path.join(root, "node_modules");
  const nodePathParts = [modulesDir, legacyModules].filter((p) => fs.existsSync(p));

  // Resources live in a temp extraction dir for portable builds, so keep the
  // workspace store (accounts, onboarding answers) under userData instead.
  const dataDir = path.join(app.getPath("userData"), "workspace-data");
  fs.mkdirSync(dataDir, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Data-dir keys win over the launching shell so testers control them.
    ...readDataDirEnv(dataDir),
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(EMBEDDED_WEB_PORT),
    HOSTNAME: "127.0.0.1",
    AUTH_SECRET: process.env.AUTH_SECRET || "cueai-desktop-test-secret-change-me",
    AUTH_URL: `http://127.0.0.1:${EMBEDDED_WEB_PORT}`,
    CUEAI_DATA_DIR: dataDir,
  };

  if (nodePathParts.length > 0) {
    const existing = env.NODE_PATH ? String(env.NODE_PATH).split(path.delimiter) : [];
    env.NODE_PATH = [...nodePathParts, ...existing].join(path.delimiter);
  }

  return env;
}

function resolveDevOrigin() {
  const envUrl = process.env.CUEAI_WEB_URL?.trim();
  if (envUrl) return normalizeWebOrigin(envUrl);
  return DEV_WEB_ORIGIN;
}

/**
 * Dev → wait for CUEAI_WEB_URL or http://127.0.0.1:3002 (npm run dev:mac starts Next).
 * Packaged → spawn Next standalone with Electron-as-Node on port 39100.
 */
export async function startEmbeddedWebServer(): Promise<string> {
  if (webOrigin) return webOrigin;

  if (!app.isPackaged) {
    webOrigin = resolveDevOrigin();
    console.log("[WEB] Waiting for web server", webOrigin);
    try {
      await waitForWebServer(webOrigin, 90000);
      console.log("[WEB] Web server ready");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[WEB] Failed to start");
      console.error("[WEB] Reason:", reason);
      throw err;
    }
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
  await waitForWebServer(webOrigin);
  return webOrigin;
}

export function getWebOrigin() {
  return webOrigin || process.env.CUEAI_WEB_URL?.trim().replace(/\/$/, "") || DEV_WEB_ORIGIN;
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
