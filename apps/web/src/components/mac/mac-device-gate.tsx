"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { MacGlassButton, MacGlassPanel } from "@/components/mac";
import { getDesktop, isMacDesktopApp } from "@/lib/desktop";
import { withDesktopParam } from "@/lib/desktop-query";
import { useRouter } from "next/navigation";

type DeviceStatus = "NEW" | "PENDING" | "ACTIVE" | "BLOCKED" | "REVOKED";
type GateStatus =
  | DeviceStatus
  | "STARTING"
  | "AUTH_CHECKING"
  | "AUTH_REQUIRED"
  | "DEVICE_CHECKING"
  | "DEVICE_REGISTERING"
  | "DEVICE_ACTIVE"
  | "DEVICE_BLOCKED"
  | "DEVICE_REVOKED"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "READY";

type PublicDevice = {
  deviceId: string;
  maskedId: string;
  deviceName: string;
  platform: "macos";
  appVersion: string;
};

const DEVICE_IPC_TIMEOUT_MS = 8000;
const DEVICE_REQUEST_TIMEOUT_MS = 12000;
const DEVICE_WATCHDOG_MS = 18000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(label));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    window.clearTimeout(timer);
  }
}

function mapDeviceStatus(status: DeviceStatus, authorized: boolean): GateStatus {
  if (status === "ACTIVE" && authorized) return "READY";
  if (status === "ACTIVE" && !authorized) return "NEW";
  if (status === "BLOCKED") return "DEVICE_BLOCKED";
  if (status === "REVOKED") return "DEVICE_REVOKED";
  return status;
}

export function MacDeviceGate({ children }: { children: ReactNode }) {
  const { session, ready, logout } = useAuth();
  const router = useRouter();
  const [mac, setMac] = useState(false);
  const [identity, setIdentity] = useState<PublicDevice | null>(null);
  const [status, setStatus] = useState<GateStatus>("STARTING");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingTimedOut, setCheckingTimedOut] = useState(false);
  const checkedUser = useRef<string | null>(null);
  const checkGen = useRef(0);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMac(isMacDesktopApp()));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!isMacDesktopApp()) {
      setStatus("READY");
      return;
    }
    console.log("[DEVICE] Startup check");
    console.log("[DEVICE] Authentication state");
    if (!session?.userId) {
      setStatus("AUTH_REQUIRED");
      setMessage("Sign in before this Mac can be verified.");
      return;
    }

    const desktop = getDesktop();
    const gen = ++checkGen.current;
    setStatus("DEVICE_CHECKING");
    setCheckingTimedOut(false);
    setMessage(null);

    const watchdog = window.setTimeout(() => {
      if (checkGen.current !== gen) return;
      setCheckingTimedOut(true);
      setStatus("NETWORK_ERROR");
      setMessage("Unable to verify this Mac. Check your internet connection and try again.");
      console.log("[DEVICE] Status = NETWORK_ERROR");
      console.log("[DEVICE] Device check completed");
    }, DEVICE_WATCHDOG_MS);

    try {
      if (!desktop?.getMacDevice) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage("CueAI Desktop could not provide a device identity. Restart CueAI and try again.");
        return;
      }

      const info = await withTimeout(
        desktop.getMacDevice(),
        DEVICE_IPC_TIMEOUT_MS,
        "Timed out reading this Mac’s secure device identity.",
      );
      if (checkGen.current !== gen) return;
      if (!info?.deviceId) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage("This Mac could not read a secure device identity. Restart CueAI and try again.");
        return;
      }
      setIdentity(info);
      console.log("[DEVICE] Device ID loaded");

      if (desktop.verifyMacDevice) {
        const result = await withTimeout(
          desktop.verifyMacDevice(),
          DEVICE_REQUEST_TIMEOUT_MS + 2000,
          "Timed out verifying this Mac.",
        );
        if (checkGen.current !== gen) return;
        if (result.status === "AUTH_REQUIRED") {
          setStatus("AUTH_REQUIRED");
          setMessage("Your session expired. Sign in again to verify this Mac.");
          await logout();
          router.replace(withDesktopParam("/login"));
          return;
        }
        if (result.status === "NETWORK_ERROR" || result.status === "SERVER_ERROR") {
          setStatus(result.status);
          setMessage(
            result.message ||
              (result.status === "NETWORK_ERROR"
                ? "Unable to verify this Mac. Check your internet connection and try again."
                : "CueAI could not verify this Mac right now. Try again in a moment."),
          );
          return;
        }
        const next = mapDeviceStatus(result.status, result.authorized);
        setStatus(next);
        return;
      }

      console.log("[DEVICE] Status request started");
      let res: Response;
      try {
        res = await fetchWithTimeout(
          `/api/devices/status?device_id=${encodeURIComponent(info.deviceId)}`,
          DEVICE_REQUEST_TIMEOUT_MS,
        );
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        console.log("[DEVICE] Status = NETWORK_ERROR");
        setStatus("NETWORK_ERROR");
        setMessage(
          aborted
            ? "Verification timed out. Check your internet connection and try again."
            : "Unable to verify this Mac. Check your internet connection and try again.",
        );
        return;
      }

      if (res.status === 401) {
        console.log("[DEVICE] Status = AUTH_REQUIRED");
        setStatus("AUTH_REQUIRED");
        setMessage("Your session expired. Sign in again to verify this Mac.");
        await logout();
        router.replace(withDesktopParam("/login"));
        return;
      }

      if (res.status >= 500 || !res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage(data.error || "Could not verify this Mac with CueAI.");
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { status?: DeviceStatus; authorized?: boolean }
        | null;
      console.log("[DEVICE] Status response received");
      if (!data || typeof data.status !== "string") {
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage("CueAI returned an invalid device status. Try again.");
        return;
      }

      const nextStatus = data.status;
      if (
        nextStatus !== "NEW" &&
        nextStatus !== "PENDING" &&
        nextStatus !== "ACTIVE" &&
        nextStatus !== "BLOCKED" &&
        nextStatus !== "REVOKED"
      ) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage("CueAI returned an unknown device status. Try again.");
        return;
      }
      console.log(`[DEVICE] Status = ${nextStatus}`);
      setStatus(mapDeviceStatus(nextStatus, data.authorized !== false));
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not verify this Mac.";
      const network =
        /timed out|timeout|failed to fetch|network|identity/i.test(text) ||
        text.includes("secure device");
      console.log(`[DEVICE] Status = ${network ? "NETWORK_ERROR" : "SERVER_ERROR"}`);
      setStatus(network ? "NETWORK_ERROR" : "SERVER_ERROR");
      setMessage(
        network
          ? "Unable to verify this Mac. Check your internet connection and try again."
          : text,
      );
    } finally {
      window.clearTimeout(watchdog);
      if (checkGen.current === gen) console.log("[DEVICE] Device check completed");
    }
  }, [logout, router, session?.userId]);

  useEffect(() => {
    if (!mac) return;
    if (!ready) return;
    if (!session?.userId) {
      checkedUser.current = null;
      const id = window.requestAnimationFrame(() => setStatus("AUTH_REQUIRED"));
      return () => window.cancelAnimationFrame(id);
    }
    if (checkedUser.current === session.userId) return;
    checkedUser.current = session.userId;
    const id = window.requestAnimationFrame(() => {
      void refresh();
    });
    return () => window.cancelAnimationFrame(id);
  }, [mac, ready, session?.userId, refresh]);

  useEffect(() => {
    if (!mac) return;
    if (status === "READY" || status === "DEVICE_ACTIVE") {
      console.log("[DEVICE] Main app unlocked");
    }
    if (status === "NEW" || status === "PENDING") {
      console.log("[DEVICE] Lock UI = Register This Mac");
    }
    if (status === "NETWORK_ERROR" || status === "SERVER_ERROR") {
      console.log("[DEVICE] Lock UI = Unable to verify this Mac");
    }
    if (
      status === "DEVICE_BLOCKED" ||
      status === "BLOCKED" ||
      status === "DEVICE_REVOKED" ||
      status === "REVOKED"
    ) {
      console.log("[DEVICE] Lock UI = This Mac is not authorized");
      console.log("[DEVICE] Lock actions = Check Again, Sign Out");
    }
  }, [mac, status]);

  async function register() {
    if (!session) return;
    const desktop = getDesktop();
    setBusy(true);
    setStatus("DEVICE_REGISTERING");
    setMessage(null);
    try {
      if (desktop?.registerMacDevice) {
        const result = await withTimeout(
          desktop.registerMacDevice(),
          DEVICE_REQUEST_TIMEOUT_MS + 2000,
          "Timed out registering this Mac.",
        );
        if (result.status === "AUTH_REQUIRED") {
          setStatus("AUTH_REQUIRED");
          await logout();
          router.replace(withDesktopParam("/login"));
          return;
        }
        if (result.status === "NETWORK_ERROR" || result.status === "SERVER_ERROR") {
          setStatus(result.status);
          setMessage(result.message || "Unable to register this Mac. Check your internet connection and try again.");
          return;
        }
        if (result.status === "BLOCKED" || result.status === "REVOKED") {
          setStatus(result.status === "BLOCKED" ? "DEVICE_BLOCKED" : "DEVICE_REVOKED");
          setMessage(result.message || "This Mac is not authorized to use this CueAI account.");
          return;
        }
        setStatus(mapDeviceStatus(result.status, result.authorized));
        return;
      }

      if (!identity) return;
      const res = await fetchWithTimeout("/api/devices/register", DEVICE_REQUEST_TIMEOUT_MS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: identity.deviceId,
          device_name: identity.deviceName,
          platform: identity.platform,
          app_version: identity.appVersion,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: DeviceStatus };
      if (res.status === 401) {
        setStatus("AUTH_REQUIRED");
        await logout();
        router.replace(withDesktopParam("/login"));
        return;
      }
      if (!res.ok) {
        setMessage(data.error || "Registration failed.");
        if (res.status === 403) setStatus("DEVICE_BLOCKED");
        else setStatus("NEW");
        return;
      }
      setStatus(data.status === "ACTIVE" ? "READY" : data.status === "PENDING" ? "PENDING" : "NEW");
    } catch {
      setStatus("NETWORK_ERROR");
      setMessage("Unable to register this Mac. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const desktop = getDesktop();
    try {
      await desktop?.clearMacDeviceSession?.();
    } catch {
      // Keep the local installation identity even if this IPC call fails.
    }
    await logout();
    checkedUser.current = null;
    router.replace(withDesktopParam("/login"));
  }

  function retry() {
    checkedUser.current = null;
    void refresh();
  }

  if (!mac) return <>{children}</>;
  if (status === "READY" || status === "DEVICE_ACTIVE") return <>{children}</>;
  if (!ready || status === "STARTING" || status === "AUTH_CHECKING") {
    return (
      <div className="mac-auth-shell">
        <MacGlassPanel>
          <p className="mac-auth-kicker">CueAI</p>
          <h1 className="mac-auth-title">Checking this Mac</h1>
          <p className="mac-auth-copy">Verifying device authorization with CueAI…</p>
        </MacGlassPanel>
      </div>
    );
  }
  if (!session || status === "AUTH_REQUIRED") {
    if (status === "AUTH_REQUIRED" && mac) {
      return (
        <div className="mac-auth-shell">
          <MacGlassPanel>
            <p className="mac-auth-kicker">CueAI</p>
            <h1 className="mac-auth-title">Sign in required</h1>
            <p className="mac-auth-copy">Sign in before this Mac can be verified.</p>
            <MacGlassButton accent onClick={() => router.replace(withDesktopParam("/login"))}>
              Sign In
            </MacGlassButton>
          </MacGlassPanel>
        </div>
      );
    }
    return <>{children}</>;
  }

  if (status === "DEVICE_CHECKING" || status === "DEVICE_REGISTERING") {
    return (
      <div className="mac-auth-shell">
        <MacGlassPanel>
          <p className="mac-auth-kicker">CueAI</p>
          <h1 className="mac-auth-title">
            {status === "DEVICE_REGISTERING" ? "Register This Mac" : "Checking this Mac"}
          </h1>
          <p className="mac-auth-copy">
            {status === "DEVICE_REGISTERING"
              ? "Registering this Mac with CueAI…"
              : "Verifying device authorization with CueAI…"}
          </p>
          {checkingTimedOut && (
            <div className="flex flex-col gap-2">
              <MacGlassButton accent onClick={retry}>
                Try Again
              </MacGlassButton>
              <MacGlassButton onClick={() => void signOut()}>Sign Out</MacGlassButton>
            </div>
          )}
        </MacGlassPanel>
      </div>
    );
  }

  const locked = status === "DEVICE_BLOCKED" || status === "DEVICE_REVOKED" || status === "BLOCKED" || status === "REVOKED";
  const network = status === "NETWORK_ERROR";
  const server = status === "SERVER_ERROR";
  const pending = status === "PENDING";
  const displayStatus = locked
    ? status === "DEVICE_REVOKED" || status === "REVOKED"
      ? "REVOKED"
      : "BLOCKED"
    : network
      ? "Network Error"
      : server
        ? "Server Error"
        : pending
          ? "PENDING"
          : "Not Registered";

  const title = locked
    ? "This Mac is not authorized"
    : network || server
      ? "Unable to verify this Mac"
      : pending
        ? "This Mac is pending"
        : "Register This Mac";

  const copy = locked
    ? "This device is not authorized to use this CueAI account."
    : network || server
      ? message || "Check your internet connection and try again."
      : pending
        ? "This Mac is registered and waiting for authorization. Check again after an administrator activates it."
        : "This Mac needs to be registered before you can use CueAI.";

  return (
    <div className="mac-auth-shell">
      <MacGlassPanel>
        <p className="mac-auth-kicker">CueAI</p>
        <h1 className="mac-auth-title">{title}</h1>
        <p className="mac-auth-copy">{copy}</p>

        {identity && (
          <div className="mb-5">
            <div className="mac-device-row">
              <span>Mac Name</span>
              <strong>{identity.deviceName}</strong>
            </div>
            <div className="mac-device-row">
              <span>Device ID</span>
              <strong>{identity.maskedId}</strong>
            </div>
            <div className="mac-device-row">
              <span>Status</span>
              <strong>{displayStatus}</strong>
            </div>
          </div>
        )}

        {message && !network && !server && (
          <p className="mb-4 text-sm text-[var(--cue-danger)]" role="alert">
            {message}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {locked || network || server || pending ? (
            <MacGlassButton accent loading={busy} loadingLabel="Checking…" onClick={retry}>
              {network || server ? "Try Again" : "Check Again"}
            </MacGlassButton>
          ) : (
            <MacGlassButton accent loading={busy} loadingLabel="Registering…" onClick={() => void register()}>
              Register This Mac
            </MacGlassButton>
          )}
          <MacGlassButton onClick={() => void signOut()}>Sign Out</MacGlassButton>
        </div>
      </MacGlassPanel>
    </div>
  );
}
