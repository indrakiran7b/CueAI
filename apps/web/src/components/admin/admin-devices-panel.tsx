"use client";

import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AdminDevice = {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  status: string;
  registeredAt: string;
  lastVerifiedAt: string | null;
  userEmail: string | null;
  userName: string | null;
  userId: string;
};

export function AdminDevicesPanel() {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/admin/devices", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { devices?: AdminDevice[]; error?: string };
    if (!res.ok) {
      setError(data.error || "Could not load devices.");
      return;
    }
    setDevices(data.devices || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, action: "activate" | "block" | "revoke" | "delete", userId?: string) {
    setBusy(`${action}-${id}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "activate" && userId ? { id, action } : { id, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Action failed.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function allowReplacement(userId: string) {
    setBusy(`replace-${userId}`);
    try {
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "allow_replacement" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not allow a replacement device.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle className="flex items-center gap-2">
          <Laptop className="h-4 w-4" />
          Registered Macs
        </CardTitle>
        <CardDescription>
          Backend is authoritative. Activate, block, or revoke a Mac without trusting the client.
        </CardDescription>
      </CardHeader>
      {error && <p className="mt-3 text-sm text-[var(--cue-danger)]">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        {devices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No Macs registered yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-muted">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Mac</th>
                <th className="py-2 pr-3">Device ID</th>
                <th className="py-2 pr-3">Platform</th>
                <th className="py-2 pr-3">App</th>
                <th className="py-2 pr-3">Registered</th>
                <th className="py-2 pr-3">Last check</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} className="border-b border-[var(--border)]/60">
                  <td className="py-3 pr-3">
                    <div>{device.userName || "—"}</div>
                    <div className="text-xs text-muted">{device.userEmail}</div>
                  </td>
                  <td className="py-3 pr-3">{device.deviceName}</td>
                  <td className="py-3 pr-3 font-mono text-xs">{device.deviceId}</td>
                  <td className="py-3 pr-3">{device.platform}</td>
                  <td className="py-3 pr-3">{device.appVersion}</td>
                  <td className="py-3 pr-3 text-xs">{new Date(device.registeredAt).toLocaleString()}</td>
                  <td className="py-3 pr-3 text-xs">
                    {device.lastVerifiedAt ? new Date(device.lastVerifiedAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-3 pr-3">{device.status}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" loading={busy === `activate-${device.id}`} onClick={() => void act(device.id, "activate")}>
                        Activate
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy === `block-${device.id}`} onClick={() => void act(device.id, "block")}>
                        Block
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy === `revoke-${device.id}`} onClick={() => void act(device.id, "revoke")}>
                        Revoke
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy === `delete-${device.id}`} onClick={() => void act(device.id, "delete")}>
                        Remove
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy === `replace-${device.userId}`} onClick={() => void allowReplacement(device.userId)}>
                        Allow replacement
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
