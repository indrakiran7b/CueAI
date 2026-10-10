import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { app, type BrowserWindow, shell } from "electron";
import {
  getOrCreateWindowsDeviceIdentity,
  windowsDeviceService,
} from "../platform/windows/windowsDevice";
import { onDesktopAuthCallback } from "./protocol";
import { getWebOrigin } from "./web-server";

const HANDOFF_TIMEOUT_MS = 3 * 60 * 1000;
const SESSION_COOKIE = "cueai_admin_session";

type StartResult = { ok: boolean; error?: string; stage?: string };
type CallbackResult = { code: string; state: string } | { error: string };

function hashVerifier(verifier: string) {
  return createHash("sha256").update(verifier, "utf8").digest("hex");
}

function handoffId(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex").slice(0, 12);
}

function startLoopback(expectedState: string): Promise<{
  origin: string;
  close: () => void;
  wait: Promise<CallbackResult>;
}> {
  return new Promise((resolve, reject) => {
    let settle: ((result: CallbackResult) => void) | null = null;
    const wait = new Promise<CallbackResult>((res) => {
      settle = res;
    });
    const done = (result: CallbackResult) => settle?.(result);
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end();
          return;
        }
        const state = (url.searchParams.get("state") || "").trim().toLowerCase();
        const code = (url.searchParams.get("code") || "").trim();
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          "<!doctype html><html><body style='font-family:Segoe UI,sans-serif;padding:24px'>You can return to CueAI Desktop and close this tab.</body></html>",
        );
        if (state === expectedState && code) done({ code, state });
        else done({ error: "Desktop authorization state did not match." });
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("loopback"));
        return;
      }
      console.info("[auth] desktop.google.loopback", { platform: "windows" });
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => {
          try {
            server.close();
          } catch {
            // ignore
          }
        },
        wait,
      });
    });
    server.on("error", reject);
  });
}

function waitForProtocol(expectedState: string): Promise<CallbackResult> {
  return new Promise((resolve) => {
    onDesktopAuthCallback((url) => {
      const state = (url.searchParams.get("state") || "").trim().toLowerCase();
      const code = (url.searchParams.get("code") || "").trim();
      if (state !== expectedState || !code) {
        console.info("[auth] desktop.google.callback.fail", { reason: "state", platform: "windows" });
        resolve({ error: "Desktop authorization state did not match." });
        return;
      }
      console.info("[auth] desktop.google.callback", { platform: "windows", via: "protocol" });
      resolve({ code, state });
    });
  });
}

async function pollReady(origin: string, state: string, abort: AbortSignal): Promise<CallbackResult> {
  while (!abort.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (abort.aborted) break;
    try {
      const res = await fetch(
        `${origin}/api/auth/desktop/google/status?state=${encodeURIComponent(state)}`,
        { cache: "no-store", signal: abort },
      );
      const body = (await res.json().catch(() => ({}))) as { ready?: boolean; code?: string };
      if (body.ready) {
        console.info("[auth] desktop.google.callback", { platform: "windows", via: "poll" });
        return { code: "", state };
      }
      if (body.code === "consumed" || body.code === "expired") {
        return { error: "This desktop sign-in request is no longer valid." };
      }
    } catch {
      if (abort.aborted) break;
    }
  }
  return { error: "Google sign-in was cancelled." };
}

async function applySessionCookie(sessionToken: string, origin: string, win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) {
    throw new Error("CueAI window is not available.");
  }
  await win.webContents.session.cookies.set({
    url: origin,
    name: SESSION_COOKIE,
    value: sessionToken,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
  });
}

export async function startWindowsGoogleSignIn(getWindow: () => BrowserWindow | null): Promise<StartResult> {
  const origin = getWebOrigin().replace(/\/$/, "");
  const identity = getOrCreateWindowsDeviceIdentity();
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("hex");
  const abort = new AbortController();
  let loopback: Awaited<ReturnType<typeof startLoopback>> | null = null;

  try {
    loopback = await startLoopback(state);
  } catch {
    console.info("[auth] desktop.google.loopback.fail", { platform: "windows" });
  }

  let begin: Response;
  try {
    begin = await fetch(`${origin}/api/auth/desktop/google/begin`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        deviceId: identity.deviceId,
        platform: "windows",
        state,
        challenge: hashVerifier(verifier),
        loopbackOrigin: loopback?.origin,
      }),
    });
  } catch {
    loopback?.close();
    console.info("[auth] desktop.google.begin.fail", { reason: "network", platform: "windows" });
    return { ok: false, error: "Could not reach CueAI to start Google sign-in.", stage: "opening_browser" };
  }

  const beginBody = (await begin.json().catch(() => ({}))) as {
    browserUrl?: string;
    error?: string;
    code?: string;
  };
  if (!begin.ok || !beginBody.browserUrl) {
    loopback?.close();
    console.info("[auth] desktop.google.begin.fail", {
      reason: beginBody.code || begin.status,
      platform: "windows",
    });
    return {
      ok: false,
      stage: "opening_browser",
      error:
        beginBody.code === "google_not_configured"
          ? "Google sign-in is not configured on the CueAI server."
          : beginBody.error || "Could not start Google sign-in.",
    };
  }

  const timeout = setTimeout(() => abort.abort(), HANDOFF_TIMEOUT_MS);
  try {
    await shell.openExternal(beginBody.browserUrl);
  } catch {
    loopback?.close();
    return { ok: false, error: "Could not open the system browser for Google sign-in.", stage: "opening_browser" };
  }
  console.info("[auth] desktop.google.awaiting_callback", {
    platform: "windows",
    appVersion: app.getVersion(),
    stage: "awaiting_callback",
    handoffId: handoffId(state),
    callbackReceived: false,
  });

  const callback = await Promise.race([
    waitForProtocol(state),
    loopback?.wait ?? new Promise<CallbackResult>(() => undefined),
    pollReady(origin, state, abort.signal),
    new Promise<CallbackResult>((resolve) => {
      abort.signal.addEventListener("abort", () => {
        resolve({ error: "Google sign-in timed out. Return to CueAI Desktop and try again." });
      });
    }),
  ]);
  clearTimeout(timeout);
  loopback?.close();
  if ("error" in callback) return { ok: false, error: callback.error, stage: "awaiting_callback" };

  let exchange: Response;
  try {
    console.info("[auth] desktop.google.exchanging_code", { platform: "windows" });
    exchange = await fetch(`${origin}/api/auth/desktop/google/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        state: callback.state || state,
        code: callback.code,
        verifier,
        deviceId: identity.deviceId,
        deviceName: windowsDeviceService.getPublicDevice().deviceName,
        platform: "windows",
        appVersion: app.getVersion(),
      }),
    });
  } catch {
    console.info("[auth] desktop.google.exchange.fail", { reason: "network", platform: "windows" });
    return { ok: false, error: "Could not finish Google sign-in with CueAI.", stage: "exchanging_code" };
  }

  const exchanged = (await exchange.json().catch(() => ({}))) as {
    sessionToken?: string;
    device_credential?: string;
    dashboardPath?: string;
    error?: string;
    code?: string;
  };
  if (!exchange.ok || !exchanged.sessionToken || !exchanged.device_credential) {
    console.info("[auth] desktop.google.exchange.fail", {
      reason: exchanged.code || exchange.status,
      platform: "windows",
    });
    return {
      ok: false,
      stage: "exchanging_code",
      error: exchanged.error || "CueAI rejected desktop Google authorization.",
    };
  }

  windowsDeviceService.saveIssuedCredential(exchanged.device_credential);
  const win = getWindow();
  await applySessionCookie(exchanged.sessionToken, origin, win);
  const path = exchanged.dashboardPath || "/dashboard";
  if (win && !win.isDestroyed()) {
    await win.loadURL(`${origin}${path.startsWith("/") ? path : `/${path}`}`);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  console.info("[auth] desktop.google.complete", { platform: "windows" });
  return { ok: true, stage: "authenticated" };
}
