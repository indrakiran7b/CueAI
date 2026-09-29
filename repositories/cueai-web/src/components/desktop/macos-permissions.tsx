"use client";

import { useEffect, useState } from "react";
import { Mic, Monitor, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  getDesktop,
  isMacDesktopApp,
  type MacPermissionState,
  type MacPermissionsSnapshot,
} from "@/lib/desktop";

function labelFor(state: MacPermissionState) {
  if (state === "granted") return "Allowed";
  if (state === "denied" || state === "restricted") return "Denied";
  if (state === "not-determined") return "Not requested";
  return "Unknown";
}

export function MacOSPermissionsPanel() {
  const [perms, setPerms] = useState<MacPermissionsSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const desktop = getDesktop();

  async function refresh() {
    if (!desktop?.getPermissions) {
      setPerms(null);
      return;
    }
    setPerms(await desktop.getPermissions());
  }

  useEffect(() => {
    if (!isMacDesktopApp()) return;
    void refresh();
  }, []);

  if (!isMacDesktopApp()) return null;

  const rows = [
    {
      key: "microphone" as const,
      icon: Mic,
      title: "Microphone",
      status: perms?.microphone,
    },
    {
      key: "screen" as const,
      icon: Monitor,
      title: "Screen Recording",
      status: perms?.screenRecording,
    },
    {
      key: "systemAudio" as const,
      icon: Volume2,
      title: "System Audio",
      status: perms?.systemAudio,
    },
  ];

  return (
    <Card className="space-y-4 p-6">
      <CardTitle>macOS Permissions</CardTitle>
      <p className="text-sm text-muted">
        CueAI shows the real macOS permission state. System audio is connected only after
        capture starts successfully.
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-xl border border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <row.icon className="h-4 w-4" />
                {row.title}
                <span className="text-xs text-muted">{labelFor(row.status?.state || "unknown")}</span>
              </p>
              <p className="mt-1 text-xs text-muted">{row.status?.message || "Checking…"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy === row.key}
                onClick={() => {
                  setBusy(row.key);
                  void desktop
                    ?.requestPermission?.(row.key)
                    .then(() => refresh())
                    .finally(() => setBusy(null));
                }}
              >
                {busy === row.key ? "Checking…" : "Request"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void desktop?.openPrivacySettings?.(row.key)}
              >
                Open System Settings
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
