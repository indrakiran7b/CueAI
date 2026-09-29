"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";

type LicenseActivation = {
  id: string;
  deviceId: string;
  platform: string;
  appVersion: string;
  status: string;
  activatedAt: string;
  lastSeenAt: string;
  deactivatedAt?: string;
};

type AdminLicense = {
  id: string;
  licenseType: string;
  clientName: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  maxDevices: number;
  activeDevices: number;
  activations: LicenseActivation[];
};

type LicenseConfig = {
  signingReady: boolean;
  signingPrivateKey: boolean;
  signingPublicKey: boolean;
  offlineGraceHours: number;
  enforcement: boolean;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function licenseState(license: AdminLicense): "active" | "expired" | "revoked" {
  if (license.status === "REVOKED") return "revoked";
  if (new Date(license.expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

export function AdminLicensesPanel() {
  const { session } = useAuth();
  const role = session?.role || "User";
  const canWrite = can(role, "licenses.write");

  const [licenses, setLicenses] = useState<AdminLicense[]>([]);
  const [config, setConfig] = useState<LicenseConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [days, setDays] = useState("30");
  const [maxDevices, setMaxDevices] = useState("2");

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<AdminLicense | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/licenses", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      licenses?: AdminLicense[];
      config?: LicenseConfig;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Could not load licenses.");
      return;
    }
    setLicenses(data.licenses || []);
    setConfig(data.config || null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    if (!canWrite) return;
    const name = clientName.trim();
    if (!name) {
      setError("Client name is required.");
      return;
    }
    setBusy("generate");
    setError(null);
    setGeneratedKey(null);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name,
          type: "CLIENT_TESTING",
          days: Math.max(1, Math.min(3650, Number(days) || 30)),
          maxDevices: Math.max(1, Math.min(50, Number(maxDevices) || 2)),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        licenseKey?: string;
        error?: string;
      };
      if (!res.ok || !data.licenseKey) {
        setError(data.error || "Failed to generate license.");
        return;
      }
      setGeneratedKey(data.licenseKey);
      setClientName("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revoke(license: AdminLicense) {
    if (!canWrite) return;
    setBusy(`revoke-${license.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/licenses?licenseId=${encodeURIComponent(license.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to revoke license.");
        return;
      }
      setConfirmRevoke(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function copyKey() {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      {config && !config.signingReady && (
        <Card className="border-[var(--cue-warning)]/40 bg-[var(--cue-warning)]/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cue-warning)]" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">License signing not configured</p>
              <p className="text-muted">
                Run{" "}
                <code className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs">
                  npm run generate:license-keys
                </code>{" "}
                and add{" "}
                <code className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs">
                  LICENSE_SIGNING_PRIVATE_KEY
                </code>{" "}
                and{" "}
                <code className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs">
                  LICENSE_SIGNING_PUBLIC_KEY
                </code>{" "}
                to <code className="text-xs">apps/web/.env.local</code>, then restart the web
                server. Keys can be generated here, but desktop activation requires signing.
              </p>
              <p className="text-xs text-muted">
                Private key: {config.signingPrivateKey ? "set" : "missing"} · Public key:{" "}
                {config.signingPublicKey ? "set" : "missing"} · Offline grace:{" "}
                {config.offlineGraceHours}h · Enforcement:{" "}
                {config.enforcement ? "on" : "off"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {config?.signingReady && (
        <Card className="p-4">
          <p className="text-sm text-muted">
            Signing keys configured · Offline grace {config.offlineGraceHours}h · Desktop
            enforcement {config.enforcement ? "enabled" : "disabled in server env"}
          </p>
        </Card>
      )}

      {canWrite && (
        <Card className="p-5">
          <CardHeader className="p-0">
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Generate license
            </CardTitle>
            <CardDescription>
              Creates a client testing license. The raw key is shown once — copy it before closing.
            </CardDescription>
          </CardHeader>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Client name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              max={3650}
              placeholder="Days valid"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              max={50}
              placeholder="Max devices"
              value={maxDevices}
              onChange={(e) => setMaxDevices(e.target.value)}
            />
            <Button
              variant="gradient"
              loading={busy === "generate"}
              disabled={!config?.signingReady}
              onClick={() => void generate()}
            >
              <KeyRound className="h-4 w-4" />
              Generate
            </Button>
          </div>
        </Card>
      )}

      {generatedKey && (
        <Card className="border-[var(--cue-success)]/40 bg-[var(--cue-success)]/5 p-5">
          <CardHeader className="p-0">
            <CardTitle className="text-base">License key — copy now</CardTitle>
            <CardDescription>
              This key is not stored in plaintext on the server. You cannot retrieve it again.
            </CardDescription>
          </CardHeader>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-[var(--background)] px-3 py-2 font-mono text-sm">
              {generatedKey}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copyKey()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setGeneratedKey(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader className="flex flex-row items-center justify-between p-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Client licenses
            </CardTitle>
            <CardDescription>
              Desktop activation keys for Windows and macOS clients.
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={Boolean(busy)}>
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>

        {error && <p className="mt-3 text-sm text-[var(--cue-danger)]">{error}</p>}

        <div className="mt-4 overflow-x-auto">
          {licenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No licenses yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-muted">
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Expires</th>
                  <th className="py-2 pr-3">Devices</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => {
                  const state = licenseState(license);
                  const isExpanded = expanded === license.id;
                  return (
                    <Fragment key={license.id}>
                      <tr className="border-b border-[var(--border)]/60">
                        <td className="py-3 pr-3 font-medium">{license.clientName}</td>
                        <td className="py-3 pr-3">
                          <Badge
                            variant={
                              state === "active"
                                ? "success"
                                : state === "expired"
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {state === "revoked" ? "Revoked" : state === "expired" ? "Expired" : "Active"}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-muted">{formatDate(license.expiresAt)}</td>
                        <td className="py-3 pr-3">
                          {license.activeDevices}/{license.maxDevices}
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted">{license.licenseType}</td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpanded(isExpanded ? null : license.id)}
                            >
                              {isExpanded ? "Hide" : "Devices"}
                            </Button>
                            {canWrite && state !== "revoked" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-[var(--cue-danger)]"
                                onClick={() => setConfirmRevoke(license)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-[var(--border)]/40">
                          <td colSpan={6} className="bg-[var(--surface-hover)]/40 px-3 py-3">
                            {license.activations.length === 0 ? (
                              <p className="text-xs text-muted">No device activations yet.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted">
                                    <th className="py-1 pr-3">Device</th>
                                    <th className="py-1 pr-3">Platform</th>
                                    <th className="py-1 pr-3">App</th>
                                    <th className="py-1 pr-3">Status</th>
                                    <th className="py-1 pr-3">Activated</th>
                                    <th className="py-1">Last seen</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {license.activations.map((act) => (
                                    <tr key={act.id}>
                                      <td className="py-1 pr-3 font-mono">{act.deviceId}</td>
                                      <td className="py-1 pr-3">{act.platform}</td>
                                      <td className="py-1 pr-3">{act.appVersion}</td>
                                      <td className="py-1 pr-3">{act.status}</td>
                                      <td className="py-1 pr-3">{formatDate(act.activatedAt)}</td>
                                      <td className="py-1">{formatDate(act.lastSeenAt)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 p-5">
            <h2 className="font-display text-lg font-semibold">Revoke license?</h2>
            <p className="text-sm text-muted">
              <strong>{confirmRevoke.clientName}</strong> will no longer activate on any device.
              Existing activations will be deactivated immediately.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmRevoke(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busy === `revoke-${confirmRevoke.id}`}
                onClick={() => void revoke(confirmRevoke)}
              >
                Revoke
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
