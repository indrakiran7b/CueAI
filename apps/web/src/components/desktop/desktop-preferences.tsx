"use client";

import { useEffect, useState } from "react";
import { Camera, Mic, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getDesktop, isDesktopApp, isMacDesktopApp } from "@/lib/desktop";
import { MacOSPermissionsPanel } from "@/components/desktop/macos-permissions";
import { MacGlassToggle } from "@/components/mac";

type DesktopPrefs = {
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  showNotifications: boolean;
  globalShortcuts: boolean;
  companionPinned: boolean;
  excludeFromCapture: boolean;
  listenMic: boolean;
  listenSystemAudio: boolean;
  autoPresentOnMeeting: boolean;
  autoHide: boolean;
  autoCollapse: boolean;
};

const defaults: DesktopPrefs = {
  launchAtStartup: false,
  minimizeToTray: true,
  showNotifications: true,
  globalShortcuts: true,
  companionPinned: true,
  excludeFromCapture: true,
  listenMic: true,
  listenSystemAudio: false,
  autoPresentOnMeeting: true,
  autoHide: false,
  autoCollapse: true,
};

export function DesktopPreferencesPanel() {
  const [prefs, setPrefs] = useState<DesktopPrefs>(defaults);
  const [ready, setReady] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const desktop = typeof window !== "undefined" && isDesktopApp();
  const mac = typeof window !== "undefined" && isMacDesktopApp();

  useEffect(() => {
    if (!isDesktopApp()) {
      setReady(true);
      return;
    }
    void (async () => {
      const api = getDesktop();
      if (!api) return;
      const all = (await api.storeGetAll()) as Record<string, unknown>;
      const settings = (all.desktopSettings as Partial<DesktopPrefs>) || {};
      setPrefs({
        launchAtStartup: Boolean(all.launchAtStartup),
        minimizeToTray: settings.minimizeToTray ?? true,
        showNotifications: settings.showNotifications ?? true,
        globalShortcuts: settings.globalShortcuts ?? true,
        companionPinned: Boolean(all.companionPinned),
        excludeFromCapture: settings.excludeFromCapture ?? true,
        listenMic: settings.listenMic ?? true,
        listenSystemAudio: settings.listenSystemAudio ?? false,
        autoPresentOnMeeting: settings.autoPresentOnMeeting ?? true,
        autoHide: settings.autoHide ?? false,
        autoCollapse: settings.autoCollapse ?? true,
      });
      const status = await api.getCaptureStatus();
      setCaptureMsg(status.message);
      setReady(true);
    })();
  }, []);

  async function update(partial: Partial<DesktopPrefs>) {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    const api = getDesktop();
    if (!api) return;

    if ("launchAtStartup" in partial) {
      await api.storeSet("launchAtStartup", next.launchAtStartup);
    }
    if ("companionPinned" in partial) {
      await api.storeSet("companionPinned", next.companionPinned);
    }

    const settingsKeys = [
      "minimizeToTray",
      "showNotifications",
      "globalShortcuts",
      "excludeFromCapture",
      "listenMic",
      "listenSystemAudio",
      "autoPresentOnMeeting",
      "autoHide",
      "autoCollapse",
    ] as const;

    if (settingsKeys.some((k) => k in partial)) {
      const existing = (await api.storeGet<Record<string, unknown>>("desktopSettings")) || {};
      await api.storeSet("desktopSettings", {
        ...existing,
        minimizeToTray: next.minimizeToTray,
        showNotifications: next.showNotifications,
        globalShortcuts: next.globalShortcuts,
        excludeFromCapture: next.excludeFromCapture,
        listenMic: next.listenMic,
        listenSystemAudio: next.listenSystemAudio,
        autoPresentOnMeeting: next.autoPresentOnMeeting,
        autoHide: next.autoHide,
        autoCollapse: next.autoCollapse,
      });
    }

    if ("listenMic" in partial || "listenSystemAudio" in partial) {
      // Keep companion overlay listen toggles in sync when Desktop API is present.
      const cueai = (
        window as Window & {
          cueai?: {
            setListenSources: (s: {
              mic: boolean;
              systemAudio: boolean;
            }) => Promise<unknown>;
          };
        }
      ).cueai;
      if (cueai?.setListenSources) {
        await cueai.setListenSources({
          mic: next.listenMic,
          systemAudio: next.listenSystemAudio,
        });
      }
    }

    if ("excludeFromCapture" in partial) {
      const status = await api.getCaptureStatus();
      setCaptureMsg(status.message);
      void api.showCompanion();
    }
  }

  async function takeScreenshot() {
    const api = getDesktop();
    if (!api?.captureScreenshot) {
      setShotMsg("Screenshot requires CueAI Desktop.");
      return;
    }
    setShotBusy(true);
    setShotMsg(null);
    try {
      const result = await api.captureScreenshot({ save: mac ? false : true });
      if (!result.ok) {
        setShotMsg(result.error || "Screenshot failed.");
        return;
      }
      setShotMsg(
        result.savedPath
          ? `Saved screenshot to ${result.savedPath}`
          : "Screenshot captured (save canceled)."
      );
    } catch (err) {
      setShotMsg(err instanceof Error ? err.message : "Screenshot failed.");
    } finally {
      setShotBusy(false);
    }
  }

  if (!ready) return null;

  if (!desktop) {
    return (
      <Card className="space-y-3 p-6">
        <CardTitle>Desktop Preferences</CardTitle>
        <p className="text-sm text-muted">
          Open CueAI Desktop to manage launch at login, tray behavior, and companion window
          preferences.
        </p>
      </Card>
    );
  }

  const rows: { key: keyof DesktopPrefs; label: string }[] = [
    { key: "listenMic", label: "Microphone — listen through companion" },
    {
      key: "listenSystemAudio",
      label: mac
        ? "System audio — capture meeting audio when Screen Recording is allowed"
        : "System audio — capture meeting/app loopback",
    },
    { key: "launchAtStartup", label: "Launch at login" },
    { key: "companionPinned", label: "Companion always on top" },
    {
      key: "excludeFromCapture",
      label: mac
        ? "Hide companion from common capture (NSWindowSharingNone; not guaranteed for every ScreenCaptureKit path)"
        : "Exclude companion from screen capture (when OS allows)",
    },
    { key: "autoPresentOnMeeting", label: "Prefer presenter layout when CueAI Private/Live is on" },
    { key: "autoCollapse", label: "Auto-collapse companion when idle" },
    { key: "autoHide", label: "Auto-hide companion when idle" },
    ...(!mac
      ? ([{ key: "minimizeToTray", label: "Minimize to tray on close" }] as const)
      : []),
    { key: "showNotifications", label: "Desktop notifications" },
    { key: "globalShortcuts", label: "Global keyboard shortcuts" },
  ];

  return (
    <div className="space-y-4">
    {mac && <MacOSPermissionsPanel />}
    <Card className="space-y-3 p-6">
      <CardTitle>{mac ? "CueAI for Mac" : "Desktop Preferences"}</CardTitle>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/40 p-4">
        <p className="mb-2 text-sm font-medium">Listen & capture</p>
        <p className="mb-3 text-xs text-muted">
          Mic audio and system audio feed the companion. Screenshot grabs your screen (companion
          hides briefly so it is not in the image).
        </p>
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
            <Mic className="h-3 w-3" /> Mic audio {prefs.listenMic ? "on" : "off"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
            <Volume2 className="h-3 w-3" /> System audio {prefs.listenSystemAudio ? "on" : "off"}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={shotBusy}
          onClick={() => void takeScreenshot()}
        >
          <Camera className="h-3.5 w-3.5" />
          {shotBusy ? "Capturing…" : "Take screenshot"}
        </Button>
        {shotMsg && <p className="mt-2 text-xs text-muted">{shotMsg}</p>}
      </div>

      {rows.map(({ key, label }) => (
        <label
          key={key}
          className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
        >
          <span>{label}</span>
          {mac ? (
            <MacGlassToggle
              checked={prefs[key]}
              onChange={(next) => void update({ [key]: next })}
              label={label}
            />
          ) : (
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => void update({ [key]: e.target.checked })}
              className="rounded"
            />
          )}
        </label>
      ))}
      {captureMsg && <p className="text-xs text-muted">{captureMsg}</p>}
    </Card>
    </div>
  );
}

