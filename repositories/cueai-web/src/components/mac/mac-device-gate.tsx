"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { MacGlassButton, MacGlassPanel } from "@/components/mac";
import { getDesktop, isMacDesktopApp, isWindowsDesktopApp } from "@/lib/desktop";
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
  platform: "macos" | "windows";
  appVersion: string;
  hasCredential?: boolean;
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

type GatePlatform = "macos" | "windows";

function isAccountDeviceShell(platform: GatePlatform) {
  return platform === "macos" ? isMacDesktopApp() : isWindowsDesktopApp();
}

function accountDeviceBridge(platform: GatePlatform) {
  const desktop = getDesktop();
  if (platform === "windows") {
    return {
      getDevice: desktop?.getAccountDevice,
      register: desktop?.registerAccountDevice,
      verify: desktop?.verifyAccountDevice,
      clearSession: desktop?.clearAccountDeviceSession,
    };
  }
  return {
    getDevice: desktop?.getMacDevice ?? desktop?.getAccountDevice,
    register: desktop?.registerMacDevice ?? desktop?.registerAccountDevice,
    verify: desktop?.verifyMacDevice ?? desktop?.verifyAccountDevice,
    clearSession: desktop?.clearMacDeviceSession ?? desktop?.clearAccountDeviceSession,
  };
}

type PageDeviceResult = {
  status: DeviceStatus;
  authorized: boolean;
};

async function recoverDeviceViaPageSession(
  action: "verify" | "register",
  identity: PublicDevice,
): Promise<PageDeviceResult | null> {
  try {
    if (action === "register") {
      const res = await fetchWithTimeout("/api/devices/register", DEVICE_REQUEST_TIMEOUT_MS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          device_id: identity.deviceId,
          device_name: identity.deviceName,
          platform: identity.platform,
          app_version: identity.appVersion,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => ({}))) as {
        status?: DeviceStatus;
        authorized?: boolean;
      };
      if (
        data.status !== "NEW" &&
        data.status !== "PENDING" &&
        data.status !== "ACTIVE" &&
        data.status !== "BLOCKED" &&
        data.status !== "REVOKED"
      ) {
        return null;
      }
      return { status: data.status, authorized: data.authorized !== false };
    }

    const res = await fetchWithTimeout(
      `/api/devices/status?device_id=${encodeURIComponent(identity.deviceId)}`,
      DEVICE_REQUEST_TIMEOUT_MS,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { status?: DeviceStatus; authorized?: boolean }
      | null;
    if (
      !data ||
      (data.status !== "NEW" &&
        data.status !== "PENDING" &&
        data.status !== "ACTIVE" &&
        data.status !== "BLOCKED" &&
        data.status !== "REVOKED")
    ) {
      return null;
    }
    return { status: data.status, authorized: data.authorized !== false };
  } catch {
    return null;
  }
}

const GATE_COPY = {
  macos: {
    signInFirst: "Sign in before this Mac can be verified.",
    noIdentity: "CueAI Desktop could not provide a device identity. Restart CueAI and try again.",
    noSecureIdentity: "This Mac could not read a secure device identity. Restart CueAI and try again.",
    network: "Unable to verify this Mac. Check your internet connection and try again.",
    server: "CueAI could not verify this Mac right now. Try again in a moment.",
    sessionExpired: "Your session expired. Sign in again to verify this Mac.",
    timeoutIdentity: "Timed out reading this device’s secure identity.",
    timeoutVerify: "Timed out verifying this Mac.",
    timeoutRegister: "Timed out registering this Mac.",
    statusInvalid: "CueAI returned an invalid device status. Try again.",
    unknownStatus: "CueAI returned an unknown device status. Try again.",
    verifyFail: "Could not verify this Mac with CueAI.",
    registerNetwork: "Unable to register this Mac. Check your internet connection and try again.",
    notAuthorized: "This Mac is not authorized to use this CueAI account.",
    checkingTitle: "Checking this Mac",
    checkingCopy: "Verifying device authorization with CueAI…",
    registerTitle: "Register This Mac",
    registeringCopy: "Registering this Mac with CueAI…",
    signInTitle: "Sign in required",
    signInCopy: "Sign in before this Mac can be verified.",
    lockedTitle: "This Mac is not authorized",
    verifyTitle: "Unable to verify this Mac",
    pendingTitle: "This Mac is pending",
    pendingCopy:
      "This Mac is registered and waiting for authorization. Check again after an administrator activates it.",
    registerCopy: "This Mac needs to be registered before you can use CueAI.",
    lockedCopy: "This device is not authorized to use this CueAI account.",
    nameLabel: "Mac Name",
    registerButton: "Register This Mac",
    genericError: "Could not verify this Mac.",
    lockRegister: "Register This Mac",
    lockVerify: "Unable to verify this Mac",
    lockUnauthorized: "This Mac is not authorized",
  },
  windows: {
    signInFirst: "Sign in before this Windows PC can be verified.",
    noIdentity: "CueAI Desktop could not provide a Windows device identity. Restart CueAI and try again.",
    noSecureIdentity: "This Windows PC could not read a secure device identity. Restart CueAI and try again.",
    network: "Unable to verify this Windows PC. Check your internet connection and try again.",
    server: "CueAI could not verify this Windows PC right now. Try again in a moment.",
    sessionExpired: "Your session expired. Sign in again to verify this Windows PC.",
    timeoutIdentity: "Timed out reading this Windows device’s secure identity.",
    timeoutVerify: "Timed out verifying this Windows PC.",
    timeoutRegister: "Timed out registering this Windows PC.",
    statusInvalid: "CueAI returned an invalid device status. Try again.",
    unknownStatus: "CueAI returned an unknown device status. Try again.",
    verifyFail: "Could not verify this Windows PC with CueAI.",
    registerNetwork: "Unable to register this Windows PC. Check your internet connection and try again.",
    notAuthorized: "This Windows PC is not authorized to use this CueAI account.",
    checkingTitle: "Checking this PC",
    checkingCopy: "Verifying Windows device authorization with CueAI…",
    registerTitle: "Register this PC",
    registeringCopy: "Registering this Windows PC with CueAI…",
    signInTitle: "Sign in required",
    signInCopy: "Sign in before this Windows PC can be verified.",
    lockedTitle: "This Windows PC is not authorized",
    verifyTitle: "Unable to verify this PC",
    pendingTitle: "This Windows PC is pending",
    pendingCopy:
      "This Windows PC is registered and waiting for authorization. Check again after an administrator activates it.",
    registerCopy: "This Windows PC needs to be registered before you can use CueAI.",
    lockedCopy: "This device is not authorized to use this CueAI account.",
    nameLabel: "PC Name",
    registerButton: "Register this PC",
    genericError: "Could not verify this Windows PC.",
    lockRegister: "Register this PC",
    lockVerify: "Unable to verify this PC",
    lockUnauthorized: "This Windows PC is not authorized",
  },
} as const;

function mapDeviceStatus(status: DeviceStatus, authorized: boolean): GateStatus {
  if (status === "ACTIVE" && authorized) return "READY";
  if (status === "ACTIVE" && !authorized) return "NEW";
  if (status === "BLOCKED") return "DEVICE_BLOCKED";
  if (status === "REVOKED") return "DEVICE_REVOKED";
  return status;
}

function AccountDeviceGate({
  platform,
  children,
}: {
  platform: GatePlatform;
  children: ReactNode;
}) {
  const labels = GATE_COPY[platform];
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
    const id = window.requestAnimationFrame(() => setMac(isAccountDeviceShell(platform)));
    return () => window.cancelAnimationFrame(id);
  }, [platform]);

  const refresh = useCallback(async () => {
    if (!isAccountDeviceShell(platform)) {
      setStatus("READY");
      return;
    }
    console.log("[DEVICE] Startup check");
    console.log("[DEVICE] Authentication state");
    console.log(`[DEVICE] platform = ${platform}`);
    console.log(`[DEVICE] implementation = ${platform === "windows" ? "windows" : "macos"}`);
    if (!session?.userId) {
      setStatus("AUTH_REQUIRED");
      setMessage(labels.signInFirst);
      return;
    }

    const gen = ++checkGen.current;
    setStatus("DEVICE_CHECKING");
    setCheckingTimedOut(false);
    setMessage(null);

    const watchdog = window.setTimeout(() => {
      if (checkGen.current !== gen) return;
      setCheckingTimedOut(true);
      setStatus("NETWORK_ERROR");
      setMessage(labels.network);
      console.log("[DEVICE] Status = NETWORK_ERROR");
      console.log("[DEVICE] Device check completed");
    }, DEVICE_WATCHDOG_MS);

    try {
      const bridge = accountDeviceBridge(platform);
      if (!bridge.getDevice) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage(labels.noIdentity);
        return;
      }

      const info = await withTimeout(
        bridge.getDevice(),
        DEVICE_IPC_TIMEOUT_MS,
        labels.timeoutIdentity,
      );
      if (checkGen.current !== gen) return;
      if (!info?.deviceId) {
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage(labels.noSecureIdentity);
        return;
      }
      console.log(`[DEVICE] device identity available = true`);
      console.log(`[DEVICE] credential available = ${Boolean(info.hasCredential)}`);
      setIdentity(info);
      console.log("[DEVICE] Device ID loaded");

      if (!info.hasCredential && bridge.register) {
        console.log("[DEVICE] Repairing missing device credential via existing registration");
        const repaired = await withTimeout(
          bridge.register(),
          DEVICE_REQUEST_TIMEOUT_MS + 2000,
          labels.timeoutRegister,
        );
        if (checkGen.current !== gen) return;
        if (repaired.status === "AUTH_REQUIRED") {
          const recovered = await recoverDeviceViaPageSession("register", info);
          if (recovered) {
            const persisted = await withTimeout(
              bridge.register(),
              DEVICE_REQUEST_TIMEOUT_MS + 2000,
              labels.timeoutRegister,
            ).catch(() => null);
            if (persisted && persisted.status !== "AUTH_REQUIRED") {
              if (persisted.status === "NETWORK_ERROR" || persisted.status === "SERVER_ERROR") {
                setStatus(mapDeviceStatus(recovered.status, recovered.authorized));
                return;
              }
              setStatus(mapDeviceStatus(persisted.status, persisted.authorized));
              return;
            }
            setStatus(mapDeviceStatus(recovered.status, recovered.authorized));
            return;
          }
          setStatus("AUTH_REQUIRED");
          setMessage(labels.sessionExpired);
          return;
        }
        if (repaired.status === "NETWORK_ERROR" || repaired.status === "SERVER_ERROR") {
          setStatus(repaired.status);
          setMessage(
            repaired.message ||
              (repaired.status === "NETWORK_ERROR" ? labels.registerNetwork : labels.server),
          );
          return;
        }
        if (repaired.status === "BLOCKED" || repaired.status === "REVOKED") {
          setStatus(repaired.status === "BLOCKED" ? "DEVICE_BLOCKED" : "DEVICE_REVOKED");
          setMessage(repaired.message || labels.notAuthorized);
          return;
        }
        setStatus(mapDeviceStatus(repaired.status, repaired.authorized));
        return;
      }

      const verify = bridge.verify;
      if (verify) {
        const result = await withTimeout(
          verify(),
          DEVICE_REQUEST_TIMEOUT_MS + 2000,
          labels.timeoutVerify,
        );
        if (checkGen.current !== gen) return;
        if (result.status === "AUTH_REQUIRED") {
          const recovered = await recoverDeviceViaPageSession("verify", info);
          if (recovered) {
            setStatus(mapDeviceStatus(recovered.status, recovered.authorized));
            return;
          }
          setStatus("AUTH_REQUIRED");
          setMessage(labels.sessionExpired);
          return;
        }
        if (result.status === "NETWORK_ERROR" || result.status === "SERVER_ERROR") {
          setStatus(result.status);
          setMessage(
            result.message ||
              (result.status === "NETWORK_ERROR" ? labels.network : labels.server),
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
            : labels.network,
        );
        return;
      }

      if (res.status === 401) {
        console.log("[DEVICE] Status = AUTH_REQUIRED");
        setStatus("AUTH_REQUIRED");
        setMessage(labels.sessionExpired);
        return;
      }

      if (res.status >= 500 || !res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage(data.error || labels.verifyFail);
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { status?: DeviceStatus; authorized?: boolean }
        | null;
      console.log("[DEVICE] Status response received");
      if (!data || typeof data.status !== "string") {
        console.log("[DEVICE] Status = SERVER_ERROR");
        setStatus("SERVER_ERROR");
        setMessage(labels.statusInvalid);
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
        setMessage(labels.unknownStatus);
        return;
      }
      console.log(`[DEVICE] Status = ${nextStatus}`);
      setStatus(mapDeviceStatus(nextStatus, data.authorized !== false));
    } catch (err) {
      const text = err instanceof Error ? err.message : labels.genericError;
      const network =
        /timed out|timeout|failed to fetch|network|identity/i.test(text) ||
        text.includes("secure device");
      console.log(`[DEVICE] Status = ${network ? "NETWORK_ERROR" : "SERVER_ERROR"}`);
      setStatus(network ? "NETWORK_ERROR" : "SERVER_ERROR");
      setMessage(
        network ? labels.network : text,
      );
    } finally {
      window.clearTimeout(watchdog);
      if (checkGen.current === gen) console.log("[DEVICE] Device check completed");
    }
  }, [labels, platform, session?.userId]);

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
      console.log(`[DEVICE] Lock UI = ${labels.lockRegister}`);
    }
    if (status === "NETWORK_ERROR" || status === "SERVER_ERROR") {
      console.log(`[DEVICE] Lock UI = ${labels.lockVerify}`);
    }
    if (
      status === "DEVICE_BLOCKED" ||
      status === "BLOCKED" ||
      status === "DEVICE_REVOKED" ||
      status === "REVOKED"
    ) {
      console.log(`[DEVICE] Lock UI = ${labels.lockUnauthorized}`);
      console.log("[DEVICE] Lock actions = Check Again, Sign Out");
    }
  }, [labels, mac, status]);

  async function register() {
    if (!session) return;
    setBusy(true);
    setStatus("DEVICE_REGISTERING");
    setMessage(null);
    try {
      const registerDevice = accountDeviceBridge(platform).register;
      if (registerDevice) {
        const result = await withTimeout(
          registerDevice(),
          DEVICE_REQUEST_TIMEOUT_MS + 2000,
          labels.timeoutRegister,
        );
        if (result.status === "AUTH_REQUIRED") {
          const recovered = identity ? await recoverDeviceViaPageSession("register", identity) : null;
          if (recovered) {
            setStatus(mapDeviceStatus(recovered.status, recovered.authorized));
            return;
          }
          setStatus("AUTH_REQUIRED");
          setMessage(labels.sessionExpired);
          return;
        }
        if (result.status === "NETWORK_ERROR" || result.status === "SERVER_ERROR") {
          setStatus(result.status);
          setMessage(result.message || labels.registerNetwork);
          return;
        }
        if (result.status === "BLOCKED" || result.status === "REVOKED") {
          setStatus(result.status === "BLOCKED" ? "DEVICE_BLOCKED" : "DEVICE_REVOKED");
          setMessage(result.message || labels.notAuthorized);
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
        setMessage(labels.sessionExpired);
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
      setMessage(labels.registerNetwork);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await accountDeviceBridge(platform).clearSession?.();
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
          <h1 className="mac-auth-title">{labels.checkingTitle}</h1>
          <p className="mac-auth-copy">{labels.checkingCopy}</p>
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
            <h1 className="mac-auth-title">{labels.signInTitle}</h1>
            <p className="mac-auth-copy">{labels.signInCopy}</p>
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
            {status === "DEVICE_REGISTERING" ? labels.registerTitle : labels.checkingTitle}
          </h1>
          <p className="mac-auth-copy">
            {status === "DEVICE_REGISTERING" ? labels.registeringCopy : labels.checkingCopy}
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
    ? labels.lockedTitle
    : network || server
      ? labels.verifyTitle
      : pending
        ? labels.pendingTitle
        : labels.registerTitle;

  const copy = locked
    ? labels.lockedCopy
    : network || server
      ? message || "Check your internet connection and try again."
      : pending
        ? labels.pendingCopy
        : labels.registerCopy;

  return (
    <div className="mac-auth-shell">
      <MacGlassPanel>
        <p className="mac-auth-kicker">CueAI</p>
        <h1 className="mac-auth-title">{title}</h1>
        <p className="mac-auth-copy">{copy}</p>

        {identity && (
          <div className="mb-5">
            <div className="mac-device-row">
              <span>{labels.nameLabel}</span>
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
              {labels.registerButton}
            </MacGlassButton>
          )}
          <MacGlassButton onClick={() => void signOut()}>Sign Out</MacGlassButton>
        </div>
      </MacGlassPanel>
    </div>
  );
}

export function MacDeviceGate({ children }: { children: ReactNode }) {
  return <AccountDeviceGate platform="macos">{children}</AccountDeviceGate>;
}

export function WindowsDeviceGate({ children }: { children: ReactNode }) {
  return <AccountDeviceGate platform="windows">{children}</AccountDeviceGate>;
}
