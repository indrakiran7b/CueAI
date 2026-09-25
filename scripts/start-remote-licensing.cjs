#!/usr/bin/env node
/**
 * Option B — remote client testing (your machine = licensing server).
 *
 * Starts the CueAI web app on port 3000 and exposes it via ngrok so a remote
 * client desktop can activate against your license store.
 *
 * Prerequisites:
 *   - ngrok CLI installed: https://ngrok.com/download
 *   - NGROK_AUTHTOKEN in apps/web/.env.local
 *   - LICENSE_SIGNING_PRIVATE_KEY + LICENSE_SIGNING_PUBLIC_KEY in .env.local
 *
 * Usage: npm run client:server
 */
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WEB_ENV = path.join(ROOT, "apps", "web", ".env.local");
const PORT = process.env.PORT || "3000";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
    out[key] = value;
  }
  return out;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function waitForWeb(url, timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, { timeout: 2500 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Web server did not start at ${url}`));
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

function waitForNgrok(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const data = await httpGetJson("http://127.0.0.1:4040/api/tunnels");
        const tunnels = data.tunnels || [];
        const https = tunnels.find((t) => t.public_url?.startsWith("https://"));
        const tunnel = https || tunnels.find((t) => t.public_url);
        if (tunnel?.public_url) {
          resolve(tunnel.public_url.replace(/\/$/, ""));
          return;
        }
      } catch {
        // ngrok API not ready yet
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("ngrok tunnel did not appear. Is ngrok installed and authenticated?"));
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

const children = [];
let shuttingDown = false;

function spawnCmd(cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  const envLocal = loadEnvFile(WEB_ENV);
  const ngrokToken = envLocal.NGROK_AUTHTOKEN || process.env.NGROK_AUTHTOKEN;

  console.log("\n=== CueAI remote licensing server ===\n");

  if (!envLocal.LICENSE_SIGNING_PRIVATE_KEY || !envLocal.LICENSE_SIGNING_PUBLIC_KEY) {
    console.warn(
      "⚠  LICENSE_SIGNING_PRIVATE_KEY / LICENSE_SIGNING_PUBLIC_KEY missing in apps/web/.env.local",
    );
    console.warn("   Run: npm run generate:license-keys\n");
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log(`[1/3] Starting web server on http://127.0.0.1:${PORT} …`);
  spawnCmd(npmCmd, ["run", "dev:web", "--", "--port", PORT, "--hostname", "127.0.0.1"], {
    PORT,
    HOSTNAME: "127.0.0.1",
  });

  await waitForWeb(`http://127.0.0.1:${PORT}/license?desktop=windows`);
  console.log(`[2/3] Web server ready\n`);

  let publicUrl = envLocal.NGROK_URL?.trim().replace(/\/$/, "") || "";
  if (!publicUrl) {
    if (!ngrokToken) {
      console.log("[3/3] NGROK_AUTHTOKEN not set — skipping ngrok.");
      console.log("\nExpose port 3000 manually (ngrok http 3000), then set in .env.local:");
      console.log("  NGROK_URL=https://YOUR-SUBDOMAIN.ngrok-free.app");
      console.log("  AUTH_URL=https://YOUR-SUBDOMAIN.ngrok-free.app");
      console.log("  NEXT_PUBLIC_APP_URL=https://YOUR-SUBDOMAIN.ngrok-free.app\n");
      console.log("Admin portal: http://127.0.0.1:3000/admin → Licenses\n");
      return;
    }

    console.log("[3/3] Starting ngrok tunnel …");
    spawnCmd("ngrok", ["http", PORT, "--log=stdout"], {
      NGROK_AUTHTOKEN: ngrokToken,
    });

    publicUrl = await waitForNgrok();
    console.log(`\n✓ Public URL: ${publicUrl}\n`);
    console.log("Add to apps/web/.env.local (then restart web if already running):\n");
    console.log(`  NGROK_URL=${publicUrl}`);
    console.log(`  AUTH_URL=${publicUrl}`);
    console.log(`  NEXT_PUBLIC_APP_URL=${publicUrl}\n`);
  } else {
    console.log(`[3/3] Using NGROK_URL from .env.local: ${publicUrl}\n`);
  }

  const publicKey = envLocal.LICENSE_SIGNING_PUBLIC_KEY || "(set LICENSE_SIGNING_PUBLIC_KEY)";

  console.log("--- Your steps ---");
  console.log("1. Open Admin → Licenses:", publicUrl ? `${publicUrl}/admin` : `http://127.0.0.1:${PORT}/admin`);
  console.log("2. Generate a license and copy the key (shown once)");
  console.log("3. Send the client:");
  console.log("   • CueAI desktop build (portable or setup)");
  console.log("   • scripts/client-env.example → they save as workspace-data/.env");
  console.log("   • Or use scripts/launch-client-desktop.ps1 with your ngrok URL\n");

  console.log("--- Client workspace-data/.env ---");
  console.log(`CUEAI_WEB_URL=${publicUrl || "https://YOUR-SUBDOMAIN.ngrok-free.app"}`);
  console.log(`LICENSE_SIGNING_PUBLIC_KEY=${publicKey.slice(0, 40)}…`);
  console.log("LICENSE_ENFORCEMENT=true\n");

  console.log("Keep this terminal open while the client tests.\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
