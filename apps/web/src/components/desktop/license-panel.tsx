"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isDesktopApp } from "@/lib/desktop";

type LicenseStatus = {
  ok: boolean;
  state: string;
  authorized: boolean;
  message?: string;
  clientName?: string;
  licenseType?: string;
  expiresAt?: string;
  devicesActive?: number;
  maxDevices?: number;
};

function formatLicenseType(value?: string) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso?: string) {
  if (!iso) return "—";
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

export function LicensePanel() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isDesktopApp() || !window.cueDesktop?.getLicenseStatus) return;
    const next = await window.cueDesktop.getLicenseStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isDesktopApp() || !window.cueDesktop?.getLicenseStatus) {
    return (
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>License</CardTitle>
          <CardDescription>License management is available in the CueAI desktop app.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function deactivate() {
    if (!window.cueDesktop?.deactivateLicense) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.cueDesktop.deactivateLicense();
      setMessage(result.message || "Device deactivated.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const active = status?.authorized && status.state === "ACTIVE";

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>License</CardTitle>
          <CardDescription>Desktop activation for this device.</CardDescription>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">License Status</dt>
            <dd className="font-medium">{active ? "Active" : status?.state || "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted">License Type</dt>
            <dd className="font-medium">{formatLicenseType(status?.licenseType)}</dd>
          </div>
          <div>
            <dt className="text-muted">Expires</dt>
            <dd className="font-medium">{formatDate(status?.expiresAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Devices</dt>
            <dd className="font-medium">
              {status?.devicesActive != null && status?.maxDevices != null
                ? `${status.devicesActive} / ${status.maxDevices}`
                : "—"}
            </dd>
          </div>
          {status?.clientName ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Client</dt>
              <dd className="font-medium">{status.clientName}</dd>
            </div>
          ) : null}
        </dl>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          {active ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void deactivate()}>
              Deactivate This Device
            </Button>
          ) : (
            <Button type="button" onClick={() => window.location.assign("/license")}>
              Enter New License
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
