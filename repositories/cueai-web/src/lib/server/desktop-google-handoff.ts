import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getOAuthProviders } from "@/auth";

export const DESKTOP_HANDOFF_TTL_MS = 10 * 60 * 1000;
export const DESKTOP_PROTOCOL_CALLBACK = "cueai://auth/callback";

export type DesktopOAuthPlatform = "windows" | "macos";

export type DesktopOAuthTicket = {
  state: string;
  deviceId: string;
  platform: DesktopOAuthPlatform;
  challenge: string;
  userId?: string;
  codeHash?: string;
  loopbackOrigin?: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;
};

export function parseSafeLoopbackOrigin(value: string | null | undefined): string | null {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const port = Number(url.port);
    if (url.protocol !== "http:") return null;
    if (url.hostname !== "127.0.0.1") return null;
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
    if (url.username || url.password || url.pathname !== "/" && url.pathname !== "") return null;
    return `http://127.0.0.1:${port}`;
  } catch {
    return null;
  }
}

type TicketStore = { tickets: DesktopOAuthTicket[] };

const DATA_DIR = process.env.CUEAI_DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "desktop-oauth-tickets.json");

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function desktopHandoffId(state: string) {
  return createHash("sha256").update(String(state || ""), "utf8").digest("hex").slice(0, 12);
}

function logHandoff(event: string, meta: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const k = key.toLowerCase();
    if (
      k.includes("secret") ||
      k.includes("token") ||
      k.includes("verifier") ||
      k.includes("credential") ||
      k === "code" ||
      k === "codehash"
    ) {
      continue;
    }
    safe[key] = value;
  }
  console.info(`[auth] desktop.google.${event}`, safe);
}

async function readStore(): Promise<TicketStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as TicketStore;
    return { tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [] };
  } catch {
    return { tickets: [] };
  }
}

async function writeStore(store: TicketStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const now = Date.now();
  const tickets = store.tickets.filter((t) => t.expiresAt > now - 60_000);
  await fs.writeFile(STORE_PATH, JSON.stringify({ tickets }, null, 2), "utf8");
}

export function googleDesktopConfigured() {
  return getOAuthProviders().google;
}

export function hashDesktopVerifier(verifier: string) {
  return sha256Hex(verifier);
}

export function createDesktopHandoffCode() {
  return randomBytes(24).toString("hex");
}

export async function beginDesktopGoogleHandoff(input: {
  deviceId: string;
  platform: string;
  state: string;
  challenge: string;
  loopbackOrigin?: string;
}): Promise<{ ok: true; browserPath: string } | { ok: false; code: string; error: string; status: number }> {
  if (!googleDesktopConfigured()) {
    logHandoff("missing_credentials", { missing: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] });
    return {
      ok: false,
      code: "google_not_configured",
      status: 503,
      error: "Google sign-in is not configured on the CueAI server.",
    };
  }

  const deviceId = String(input.deviceId || "").trim();
  const state = String(input.state || "").trim().toLowerCase();
  const challenge = String(input.challenge || "").trim().toLowerCase();
  const platform = String(input.platform || "").trim().toLowerCase();

  if (deviceId.length < 8) {
    return { ok: false, code: "invalid_device", status: 400, error: "A valid device identifier is required." };
  }
  if (platform !== "windows" && platform !== "macos") {
    return { ok: false, code: "invalid_platform", status: 400, error: "Unsupported desktop platform." };
  }
  if (!/^[a-f0-9]{32,128}$/.test(state)) {
    return { ok: false, code: "invalid_state", status: 400, error: "Invalid desktop authorization state." };
  }
  if (!/^[a-f0-9]{64}$/.test(challenge)) {
    return { ok: false, code: "invalid_challenge", status: 400, error: "Invalid desktop authorization challenge." };
  }
  const loopbackOrigin = parseSafeLoopbackOrigin(input.loopbackOrigin);
  if (input.loopbackOrigin && !loopbackOrigin) {
    return { ok: false, code: "invalid_loopback", status: 400, error: "Desktop loopback callback is invalid." };
  }

  const now = Date.now();
  const store = await readStore();
  store.tickets = store.tickets.filter((t) => t.state !== state && t.expiresAt > now);
  store.tickets.push({
    state,
    deviceId,
    platform,
    challenge,
    loopbackOrigin: loopbackOrigin || undefined,
    createdAt: now,
    expiresAt: now + DESKTOP_HANDOFF_TTL_MS,
  });
  await writeStore(store);
  logHandoff("begin", { handoffId: desktopHandoffId(state), platform, configured: true, stage: "begin" });
  return { ok: true, browserPath: `/auth/desktop/google?state=${encodeURIComponent(state)}` };
}

export async function getDesktopGoogleTicketStatus(state: string) {
  const ticket = await findTicket(state);
  if (!ticket) return { ok: false as const, code: "unknown_state" };
  if (ticket.consumedAt) return { ok: false as const, code: "consumed" };
  if (ticket.expiresAt <= Date.now()) return { ok: false as const, code: "expired" };
  return { ok: true as const, platform: ticket.platform, ready: Boolean(ticket.userId) };
}

function findUniqueOpenTicket(tickets: DesktopOAuthTicket[], userId: string, now: number) {
  const open = tickets.filter(
    (t) => !t.consumedAt && t.expiresAt > now && (!t.userId || t.userId === userId),
  );
  return open.length === 1 ? open[0] : null;
}

async function findTicket(state: string) {
  const normalized = String(state || "").trim().toLowerCase();
  if (!normalized) return null;
  const store = await readStore();
  return store.tickets.find((t) => t.state === normalized) || null;
}

export async function finishDesktopGoogleHandoff(input: {
  state: string;
  userId: string;
}): Promise<
  | { ok: true; deeplink: string; loopbackUrl?: string }
  | { ok: false; code: string; error: string; status: number }
> {
  const store = await readStore();
  const now = Date.now();
  const state = String(input.state || "").trim().toLowerCase();
  const ticket = state
    ? store.tickets.find((t) => t.state === state)
    : findUniqueOpenTicket(store.tickets, input.userId, now);
  if (!ticket) {
    if (!state) {
      return { ok: false, code: "no_open_ticket", status: 404, error: "No desktop sign-in is waiting." };
    }
    logHandoff("finish.fail", { reason: "unknown_state", stage: "finish" });
    return { ok: false, code: "unknown_state", status: 400, error: "This desktop sign-in request was not found." };
  }
  if (ticket.consumedAt) {
    logHandoff("finish.fail", { reason: "consumed" });
    return { ok: false, code: "consumed", status: 409, error: "This desktop sign-in request was already used." };
  }
  if (ticket.expiresAt <= now) {
    logHandoff("finish.fail", { reason: "expired", handoffId: desktopHandoffId(ticket.state), stage: "finish" });
    return { ok: false, code: "expired", status: 410, error: "This desktop sign-in request expired. Try again from CueAI Desktop." };
  }
  if (ticket.userId && ticket.userId !== input.userId) {
    logHandoff("finish.fail", { reason: "user_mismatch" });
    return { ok: false, code: "user_mismatch", status: 409, error: "This desktop sign-in request belongs to another session." };
  }

  const code = createDesktopHandoffCode();
  ticket.userId = input.userId;
  ticket.codeHash = sha256Hex(code);
  await writeStore(store);
  logHandoff("finish", {
    handoffId: desktopHandoffId(ticket.state),
    platform: ticket.platform,
    loopback: Boolean(ticket.loopbackOrigin),
    stage: "finish",
    claimedWithoutState: !state,
  });
  const query = `code=${encodeURIComponent(code)}&state=${encodeURIComponent(ticket.state)}`;
  const deeplink = `${DESKTOP_PROTOCOL_CALLBACK}?${query}`;
  const loopbackUrl = ticket.loopbackOrigin ? `${ticket.loopbackOrigin}/callback?${query}` : undefined;
  return { ok: true, deeplink, loopbackUrl };
}

export async function exchangeDesktopGoogleHandoff(input: {
  state: string;
  code: string;
  verifier: string;
  deviceId: string;
}): Promise<
  | { ok: true; userId: string; platform: DesktopOAuthPlatform }
  | { ok: false; code: string; error: string; status: number }
> {
  const store = await readStore();
  const state = String(input.state || "").trim().toLowerCase();
  const ticket = store.tickets.find((t) => t.state === state);
  if (!ticket) {
    logHandoff("exchange.fail", { reason: "unknown_state" });
    return { ok: false, code: "unknown_state", status: 400, error: "Desktop authorization was not found." };
  }
  if (ticket.consumedAt) {
    logHandoff("exchange.fail", { reason: "consumed" });
    return { ok: false, code: "consumed", status: 409, error: "Desktop authorization was already used." };
  }
  if (ticket.expiresAt <= Date.now()) {
    logHandoff("exchange.fail", { reason: "expired" });
    return { ok: false, code: "expired", status: 410, error: "Desktop authorization expired." };
  }
  if (!ticket.userId || !ticket.codeHash) {
    logHandoff("exchange.fail", { reason: "not_ready" });
    return { ok: false, code: "not_ready", status: 409, error: "Finish Google sign-in in the browser first." };
  }
  if (ticket.deviceId !== String(input.deviceId || "").trim()) {
    logHandoff("exchange.fail", { reason: "device_mismatch" });
    return { ok: false, code: "device_mismatch", status: 403, error: "This authorization is bound to another device." };
  }
  if (!safeEqualHex(ticket.challenge, hashDesktopVerifier(String(input.verifier || "")))) {
    logHandoff("exchange.fail", { reason: "verifier" });
    return { ok: false, code: "verifier", status: 403, error: "Desktop authorization could not be verified." };
  }
  const providedCode = String(input.code || "").trim();
  if (providedCode) {
    if (!safeEqualHex(ticket.codeHash, sha256Hex(providedCode))) {
      logHandoff("exchange.fail", { reason: "code" });
      return { ok: false, code: "code", status: 403, error: "Desktop authorization code is invalid." };
    }
  } else if (!ticket.userId) {
    logHandoff("exchange.fail", { reason: "not_ready" });
    return { ok: false, code: "not_ready", status: 409, error: "Finish Google sign-in in the browser first." };
  }

  ticket.consumedAt = Date.now();
  await writeStore(store);
  logHandoff("exchange", {
    handoffId: desktopHandoffId(ticket.state),
    platform: ticket.platform,
    stage: "exchange",
    sessionExchange: true,
    deviceValidation: true,
  });
  return { ok: true, userId: ticket.userId, platform: ticket.platform };
}
