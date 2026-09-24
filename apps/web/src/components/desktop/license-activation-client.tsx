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

export function LicenseActivationClient() {
  const params = useSearchParams();
  const desktop = params.get("desktop");
  const initialState = params.get("state");
  const [licenseKey, setLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LicenseResult | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [inDesktop, setInDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInDesktop(isDesktopApp() && Boolean(window.cueDesktop?.activateLicense));
  }, []);

  const headline = useMemo(() => {
    if (result?.authorized) return "CueAI is activated";
    if (initialState === "EXPIRED" || result?.state === "EXPIRED") return "License expired";
    if (initialState === "REVOKED" || result?.state === "REVOKED") return "License revoked";
    return "Activate CueAI";
  }, [initialState, result]);

  const refreshDevice = useCallback(async () => {
    if (!window.cueDesktop?.getLicenseDevice) return;
    const device = await window.cueDesktop.getLicenseDevice();
    setDeviceLabel(`${device.deviceName} · ${device.maskedId}`);
  }, []);

  useEffect(() => {
    void refreshDevice();
    if (!inDesktop) return;
    void window.cueDesktop?.getLicenseStatus?.().then((status) => {
      if (status.authorized) setResult(status);
    });
  }, [inDesktop, refreshDevice]);

  async function activate() {
    if (!window.cueDesktop?.activateLicense) return;
    setBusy(true);
    setResult(null);
    try {
      const normalized = licenseKey.replace(/\s+/g, "").trim();
      const response = await window.cueDesktop.activateLicense(normalized);
      setResult(response);
      if (response.authorized) {
        setTimeout(() => {
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
            <h1 className="text-2xl font-semibold tracking-tight">Activate CueAI</h1>
            <p className="text-sm text-muted">Loading…</p>
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
              Open this screen from the CueAI desktop application to activate a client testing license.
            </p>
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
            Enter your CueAI client testing license key to activate this device.
          </p>
          {deviceLabel ? <p className="text-xs text-muted">{deviceLabel}</p> : null}
        </div>

        {result?.authorized ? (
          <div className="space-y-2 rounded-xl bg-primary/10 p-4 text-sm">
            <p className="font-medium text-primary">Activation successful</p>
            {result.clientName ? <p>Client: {result.clientName}</p> : null}
            {result.licenseType ? <p>Type: {result.licenseType.replace(/_/g, " ")}</p> : null}
            {result.expiresAt ? <p>Expires: {formatDate(result.expiresAt)}</p> : null}
          </div>
        ) : (
          <>
            <Input
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="CUEAI-CLIENT-XXXX-XXXX-XXXX-XXXX"
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
            <Button type="button" className="w-full" disabled={busy || !licenseKey.trim()} onClick={() => void activate()}>
              {busy ? "Activating…" : "Activate"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
