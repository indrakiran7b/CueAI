/**
 * Loopback-only control port so the CueAI web UI can open the overlay.
 * Callers must be a trusted origin and present the per-launch bridge token.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { showCompanion, hideCompanion, toggleCompanion } from "../windows/companion-window";
import { setMeetingSession, getMeetingSession } from "./screen-share";
import { EMBEDDED_WEB_PORT, getWebOrigin } from "./web-server";

export const CUEAI_BRIDGE_PORT = 39291;

const TRUSTED_LOOPBACK_PORTS = new Set(["3000", String(EMBEDDED_WEB_PORT)]);
const MAX_BODY_BYTES = 64 * 1024;

let server: http.Server | null = null;
let bridgeToken = "";

function newBridgeToken() {
  return randomBytes(32).toString("hex");
}

function requestOrigin(req: http.IncomingMessage): string | undefined {
  const origin = req.headers.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : undefined;
}

function isTrustedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === "null") return false;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const extras = [getWebOrigin(), process.env.CUEAI_WEB_URL];
  for (const extra of extras) {
    const raw = extra?.trim();
    if (!raw) continue;
    try {
      if (url.origin === new URL(raw).origin) return true;
    } catch {
      // ignore malformed extra origins
    }
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!loopback) return false;

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return TRUSTED_LOOPBACK_PORTS.has(port);
}

function tokenMatches(provided: string | undefined): boolean {
  if (!provided || !bridgeToken) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(bridgeToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function presentedToken(req: http.IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const named = req.headers["x-cueai-bridge-token"];
  return typeof named === "string" ? named.trim() : undefined;
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!isTrustedOrigin(origin) || !origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-CueAI-Bridge-Token, Access-Control-Request-Private-Network",
    "Access-Control-Allow-Private-Network": "true",
  };
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
  origin?: string
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...corsHeaders(origin),
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += buf.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function authorize(req: http.IncomingMessage, { tokenRequired }: { tokenRequired: boolean }) {
  const origin = requestOrigin(req);
  if (!isTrustedOrigin(origin)) {
    return { ok: false as const, status: 403, error: "untrusted_origin", origin };
  }
  if (tokenRequired && !tokenMatches(presentedToken(req))) {
    return { ok: false as const, status: 401, error: "unauthorized", origin };
  }
  return { ok: true as const, origin };
}

export function startLocalBridge() {
  if (server) return;
  bridgeToken = newBridgeToken();

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${CUEAI_BRIDGE_PORT}`);
    const method = req.method || "GET";
    const origin = requestOrigin(req);

    if (method === "OPTIONS") {
      if (!isTrustedOrigin(origin)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    try {
      if (url.pathname === "/health" && method === "GET") {
        const auth = authorize(req, { tokenRequired: false });
        if (!auth.ok) {
          sendJson(res, auth.status, { ok: false, error: auth.error }, origin);
          return;
        }
        sendJson(
          res,
          200,
          { ok: true, service: "cueai-desktop-bridge", token: bridgeToken },
          auth.origin
        );
        return;
      }

      const auth = authorize(req, { tokenRequired: true });
      if (!auth.ok) {
        sendJson(res, auth.status, { ok: false, error: auth.error }, origin);
        return;
      }

      if (url.pathname === "/companion/show" && method === "POST") {
        showCompanion();
        sendJson(res, 200, { ok: true, action: "show" }, auth.origin);
        return;
      }

      if (url.pathname === "/companion/hide" && method === "POST") {
        hideCompanion();
        sendJson(res, 200, { ok: true, action: "hide" }, auth.origin);
        return;
      }

      if (url.pathname === "/companion/toggle" && method === "POST") {
        toggleCompanion();
        sendJson(res, 200, { ok: true, action: "toggle" }, auth.origin);
        return;
      }

      if (url.pathname === "/meeting/session" && method === "POST") {
        const raw = await readBody(req);
        const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        // Session update owns show/hide via screen-share controller.
        setMeetingSession({
          active: typeof payload.active === "boolean" ? payload.active : undefined,
          screenSharing:
            typeof payload.screenSharing === "boolean" ? payload.screenSharing : undefined,
          meetingId: typeof payload.meetingId === "string" ? payload.meetingId : undefined,
          title: typeof payload.title === "string" ? payload.title : undefined,
          cueAiMode:
            payload.cueAiMode === "inactive" ||
            payload.cueAiMode === "private" ||
            payload.cueAiMode === "live"
              ? payload.cueAiMode
              : undefined,
        });
        // Explicit re-show when already active (e.g. Start Session / Live click).
        if (payload.showCompanion === true) {
          showCompanion();
        }
        if (payload.hideCompanion === true) {
          hideCompanion();
        }
        sendJson(res, 200, { ok: true, session: getMeetingSession() }, auth.origin);
        return;
      }

      if (url.pathname === "/meeting/session" && method === "GET") {
        sendJson(res, 200, { ok: true, session: getMeetingSession() }, auth.origin);
        return;
      }

      sendJson(res, 404, { ok: false, error: "not_found" }, auth.origin);
    } catch (err) {
      sendJson(
        res,
        err instanceof Error && err.message === "payload_too_large" ? 413 : 500,
        {
          ok: false,
          error: err instanceof Error ? err.message : "bridge_error",
        },
        origin
      );
    }
  });

  server.on("error", (err) => {
    console.error("[cueai-bridge]", err);
  });

  server.listen(CUEAI_BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`[cueai-bridge] listening on http://127.0.0.1:${CUEAI_BRIDGE_PORT}`);
  });
}

export function stopLocalBridge() {
  if (!server) return;
  server.close();
  server = null;
  bridgeToken = "";
}
