"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDesktopApp } from "@/lib/desktop";

type LicenseResult = {
  ok: boolean;
  state: string;
  authorized: boolean;
  message?: string;
  clientName?: string;
  licenseType?: string;
  expiresAt?: string;
  plan?: string;
};

function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function stateHeadline(state: string | null | undefined, authorized?: boolean): string {
  if (authorized) return "License activated";
  switch (state) {
    case "EXPIRED":
      return "License expired";
    case "REVOKED":
      return "License revoked";
    case "SUSPENDED":
      return "License suspended";
    case "DEVICE_LIMIT_REACHED":
      return "Device unauthorized";
    case "INVALID":
      return "License invalid";
    case "NETWORK_ERROR":
      return "License server unavailable";
    case "NOT_ACTIVATED":
      return "Device registration required";
    case "CHECKING":
      return "Checking license…";
    default:
      return "Activate CueAI";
  }
}

export function LicenseActivationClient() {
  const params = useSearchParams();
  const desktop = params.get("desktop");
  const initialState = params.get("state");
  const [licenseKey, setLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState<LicenseResult | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [inDesktop, setInDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInDesktop(isDesktopApp() && Boolean(window.cueDesktop?.activateLicense));
  }, []);

  const headline = useMemo(() => {
    if (checking && inDesktop) return stateHeadline("CHECKING");
    return stateHeadline(result?.state || initialState, result?.authorized);
  }, [checking, inDesktop, initialState, result]);

  const refreshDevice = useCallback(async () => {
    if (!window.cueDesktop?.getLicenseDevice) return;
    const device = await window.cueDesktop.getLicenseDevice();
    setDeviceLabel(`${device.deviceName} · ${device.maskedId}`);
  }, []);

  useEffect(() => {
    void refreshDevice();
    if (!inDesktop) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    void (async () => {
      try {
        // Prefer online validation when available so revoked/expired licenses cannot open the app.
        const status =
          (await window.cueDesktop?.validateLicense?.()) ||
          (await window.cueDesktop?.getLicenseStatus?.());
        if (cancelled || !status) return;
        setResult(status);
        if (status.authorized) {
          const next =
            desktop === "macos" || desktop === "mac"
              ? "/login?desktop=mac"
              : "/dashboard";
          window.setTimeout(() => window.location.assign(next), 600);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inDesktop, refreshDevice, desktop]);

  async function activate() {
    if (!window.cueDesktop?.activateLicense) return;
    setBusy(true);
    setResult(null);
    try {
      const normalized = licenseKey.replace(/\s+/g, "").trim();
      const response = await window.cueDesktop.activateLicense(normalized);
      setResult(response);
      if (response.authorized) {
        window.setTimeout(() => {
          const next =
            desktop === "macos" || desktop === "mac"
              ? "/login?desktop=mac"
              : "/dashboard";
          window.location.assign(next);
        }, 900);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <Logo className="mx-auto h-10 w-10" />
            <h1 className="text-2xl font-semibold tracking-tight">Checking license…</h1>
            <p className="text-sm text-muted">Please wait.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!inDesktop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <Logo className="mx-auto h-10 w-10" />
            <h1 className="text-2xl font-semibold tracking-tight">Activate CueAI</h1>
            <p className="text-sm text-muted">
              Open this screen from the CueAI desktop application to activate a license on this
              device.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <Logo className="mx-auto h-10 w-10" />
            <h1 className="text-2xl font-semibold tracking-tight">Checking license…</h1>
            <p className="text-sm text-muted">Verifying this device with CueAI.</p>
            {deviceLabel ? <p className="text-xs text-muted">{deviceLabel}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <Logo className="mx-auto h-10 w-10" />
          <h1 className="text-2xl font-semibold tracking-tight">{headline}</h1>
          <p className="text-sm text-muted">
            {result?.authorized
              ? "Opening CueAI…"
              : "Enter your CueAI license key to authorize this device."}
          </p>
          {deviceLabel ? <p className="text-xs text-muted">{deviceLabel}</p> : null}
        </div>

        {result?.authorized ? (
          <div className="space-y-2 rounded-xl bg-primary/10 p-4 text-sm">
            <p className="font-medium text-primary">License activated</p>
            {result.plan ? <p>Plan: {result.plan}</p> : null}
            {result.clientName ? <p>License: {result.clientName}</p> : null}
            {result.licenseType ? <p>Type: {result.licenseType.replace(/_/g, " ")}</p> : null}
            {result.expiresAt ? <p>Expires: {formatDate(result.expiresAt)}</p> : null}
          </div>
        ) : (
          <>
            <Input
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="KG-XXXX-XXXX-XXXX or CUEAI-CLIENT-…"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") void activate();
              }}
            />
            {result?.message ? (
              <p className="text-sm text-destructive" role="alert">
                {result.message}
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={busy || !licenseKey.trim()}
              onClick={() => void activate()}
            >
              {busy ? "Activating…" : "Activate"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
