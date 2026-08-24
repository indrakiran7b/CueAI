import http from "node:http";
import { showCompanion, hideCompanion, toggleCompanion } from "../windows/companion-window";
import { setMeetingSession, getMeetingSession } from "./screen-share";

/** Loopback-only control port so the web UI (browser or Electron) can open the overlay. */
export const CUEAI_BRIDGE_PORT = 39291;

let server: http.Server | null = null;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Access-Control-Request-Private-Network",
  "Access-Control-Allow-Private-Network": "true",
};

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function startLocalBridge() {
  if (server) return;

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${CUEAI_BRIDGE_PORT}`);
    const method = req.method || "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    try {
      if (url.pathname === "/health" && method === "GET") {
        sendJson(res, 200, { ok: true, service: "cueai-desktop-bridge" });
        return;
      }

      if (url.pathname === "/companion/show" && method === "POST") {
        showCompanion();
        sendJson(res, 200, { ok: true, action: "show" });
        return;
      }

      if (url.pathname === "/companion/hide" && method === "POST") {
        hideCompanion();
        sendJson(res, 200, { ok: true, action: "hide" });
        return;
      }

      if (url.pathname === "/companion/toggle" && method === "POST") {
        toggleCompanion();
        sendJson(res, 200, { ok: true, action: "toggle" });
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
        sendJson(res, 200, { ok: true, session: getMeetingSession() });
        return;
      }

      if (url.pathname === "/meeting/session" && method === "GET") {
        sendJson(res, 200, { ok: true, session: getMeetingSession() });
        return;
      }

      sendJson(res, 404, { ok: false, error: "not_found" });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : "bridge_error",
      });
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
}
