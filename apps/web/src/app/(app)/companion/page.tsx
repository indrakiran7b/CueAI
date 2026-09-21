"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MacGlassButton, MacGlassToggle, MacSegmentedControl } from "@/components/mac";
import {
  Monitor,
  Sparkles,
  Terminal,
  Keyboard,
  Layers,
  ArrowUpRight,
  EyeOff,
  Shield,
  Mic,
  Volume2,
  Camera,
  PhoneOff,
  Minimize2,
} from "lucide-react";
import {
  DESKTOP_BRIDGE_URL,
  DESKTOP_PROTOCOL_COMPANION,
  getDesktop,
  isDesktopAvailable,
  isMacDesktopApp,
  openCompanionOverlay,
  tryLaunchDesktopApp,
  type CaptureStatus,
  type CompanionOpenResult,
  type MacPermissionState,
  type MacPermissionsSnapshot,
  type MeetingSession,
} from "@/lib/desktop";

function permissionCopy(
  state: MacPermissionState | undefined,
  granted: string,
  denied: string,
  pending: string,
  grantedMark = "✓ Permission granted",
) {
  if (state === "granted") return { mark: grantedMark, desc: granted };
  if (state === "denied" || state === "restricted") {
    return { mark: "⚠ Permission required", desc: denied };
  }
  if (state === "not-determined") return { mark: "⚠ Permission required", desc: pending };
  if (!state) return { mark: "Checking…", desc: pending };
  return { mark: "⚠ Permission required", desc: pending };
}

function permissionAction(
  state: MacPermissionState | undefined,
): "settings" | "fix" | null {
  if (state === "denied" || state === "restricted") return "settings";
  if (state === "not-determined") return "fix";
  return null;
}

type BridgeStatus = {
  ok?: boolean;
  visible?: boolean;
  loadError?: string | null;
  bounds?: { width: number; height: number } | null;
};

type ListenSources = { mic: boolean; systemAudio: boolean };

const features = [
  {
    icon: Mic,
    title: "Mic audio listening",
    desc: "Toggle microphone capture in the companion header so CueAI can listen to your side of the call.",
  },
  {
    icon: Volume2,
    title: "System audio listening",
    desc: "Capture meeting playback through the platform audio service — Windows loopback on Windows, Screen Recording audio on macOS.",
  },
  {
    icon: Camera,
    title: "Screenshot capture",
    desc: "Grab a clean full-screen PNG from the companion. The overlay hides briefly so it is not in the shot.",
  },
  {
    icon: Layers,
    title: "System-wide always-on-top",
    desc: "Native Electron window floats above Zoom, Meet, Teams, and other apps — not just this browser tab.",
  },
  {
    icon: EyeOff,
    title: "Invisible in screen share",
    desc: "Content protection excludes the overlay from capture so only you see CueAI during full-screen share.",
  },
  {
    icon: Shield,
    title: "Survives closing the page",
    desc: "Overlay lives in the Desktop process until you hit End Session or Close — closing the website does not dismiss it.",
  },
  {
    icon: Keyboard,
    title: "Global hotkey",
    desc: "Toggle with ⌘⇧Space on Mac or Ctrl+Shift+Space on Windows without leaving your meeting.",
  },
  {
    icon: Sparkles,
    title: "Live AI answers",
    desc: "Transcript, mic indicators, pin/copy/regenerate, presenter mode.",
  },
];

function ControlCard({
  icon: Icon,
  title,
  status,
  desc,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  status: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Icon className="mb-3 h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs font-medium text-foreground">{status}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{desc}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 pt-1">{children}</div>
      </div>
    </Card>
  );
}

export default function CompanionPage() {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const [desktopReady, setDesktopReady] = useState<boolean | null>(null);
  const [overlayVisible, setOverlayVisible] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState<CompanionOpenResult | null>(null);
  const [mac, setMac] = useState(false);
  const [view, setView] = useState<"overlay" | "capabilities">("overlay");
  const [perms, setPerms] = useState<MacPermissionsSnapshot | null>(null);
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [listen, setListen] = useState<ListenSources>({ mic: false, systemAudio: false });
  const [meeting, setMeeting] = useState<MeetingSession | null>(null);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const [micBusy, setMicBusy] = useState(false);
  const [systemBusy, setSystemBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    setMac(isMacDesktopApp());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      const desktop = getDesktop();
      if (desktop) {
        try {
          const status = await desktop.getStatus();
          if (cancelled) return;
          setDesktopReady(true);
          setOverlayVisible(Boolean(status.companionVisible));
          try {
            if (desktop.getPermissions) setPerms(await desktop.getPermissions());
            if (desktop.getCaptureStatus) setCapture(await desktop.getCaptureStatus());
            if (desktop.getListenSources) setListen(await desktop.getListenSources());
            if (desktop.getMeetingSession) setMeeting(await desktop.getMeetingSession());
          } catch {
            /* permissions optional */
          }
        } catch {
          if (!cancelled) setDesktopReady(false);
        }
        return;
      }

      const ok = await isDesktopAvailable();
      if (cancelled) return;
      setDesktopReady(ok);
      if (!ok) {
        setOverlayVisible(null);
        return;
      }
      try {
        const res = await fetch(`${DESKTOP_BRIDGE_URL}/companion/status`, { method: "GET" });
        if (!res.ok) return;
        const status = (await res.json()) as BridgeStatus;
        if (!cancelled) setOverlayVisible(Boolean(status.visible));
      } catch {
        /* bridge unreachable */
      }
    }

    async function refreshBackend() {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!cancelled) setBackendOk(res.ok);
      } catch {
        if (!cancelled) setBackendOk(false);
      }
    }

    void refreshStatus();
    void refreshBackend();
    const timer = window.setInterval(() => {
      void refreshStatus();
      void refreshBackend();
    }, 4000);

    const desktop = getDesktop();
    const offCapture = desktop?.onCaptureStatus?.((status) => {
      if (!cancelled) setCapture(status);
    });
    const offListen = desktop?.onListenSources?.((sources) => {
      if (!cancelled) setListen(sources);
    });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      offCapture?.();
      offListen?.();
    };
  }, []);

  async function copyLaunch() {
    try {
      await navigator.clipboard.writeText("npm run dev:desktop");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  async function tryOpenOverlay() {
    setOpening(true);
    try {
      const result = await openCompanionOverlay();
      setLastResult(result);
      if (result.mode === "native") {
        setDesktopReady(true);
        setOverlayVisible(result.issue ? false : true);
      }
    } catch (err) {
      setLastResult({
        mode: "native",
        issue: "load_error",
        loadError: err instanceof Error ? err.message : "Could not open the overlay.",
      });
    } finally {
      setOpening(false);
    }
  }

  function tryDeepLink() {
    tryLaunchDesktopApp("companion");
    setLastResult({ mode: "launching" });
    window.setTimeout(() => {
      void isDesktopAvailable().then(setDesktopReady);
    }, 1500);
  }

  async function toggleMic(next: boolean) {
    const desktop = getDesktop();
    if (!desktop?.setListenSources || micBusy) return;
    setMicBusy(true);
    try {
      if (next && perms?.microphone.state !== "granted") {
        await desktop.requestPermission?.("microphone");
        if (desktop.getPermissions) setPerms(await desktop.getPermissions());
      }
      setListen(await desktop.setListenSources({ mic: next }));
    } finally {
      setMicBusy(false);
    }
  }

  async function toggleSystemAudio(next: boolean) {
    const desktop = getDesktop();
    if (!desktop?.setListenSources || systemBusy) return;
    setSystemBusy(true);
    try {
      if (next && perms?.systemAudio.state !== "granted") {
        await desktop.requestPermission?.("systemAudio");
        if (desktop.getPermissions) setPerms(await desktop.getPermissions());
      }
      setListen(await desktop.setListenSources({ systemAudio: next }));
    } finally {
      setSystemBusy(false);
    }
  }

  async function togglePrivacy(next: boolean) {
    const desktop = getDesktop();
    if (!desktop?.setExcludeCapture || privacyBusy) return;
    setPrivacyBusy(true);
    try {
      setCapture(await desktop.setExcludeCapture(next));
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function takeScreenshot() {
    const desktop = getDesktop();
    if (!desktop?.captureScreenshot || shotBusy) return;
    setShotBusy(true);
    setShotMsg(null);
    try {
      if (perms?.screenRecording.state !== "granted") {
        await desktop.requestPermission?.("screen");
        if (desktop.getPermissions) setPerms(await desktop.getPermissions());
      }
      const result = await desktop.captureScreenshot({ save: false });
      setShotMsg(result.ok ? "Screenshot captured." : result.error || "Screenshot failed.");
    } catch (err) {
      setShotMsg(err instanceof Error ? err.message : "Screenshot failed.");
    } finally {
      setShotBusy(false);
    }
  }

  async function hideOverlay() {
    const desktop = getDesktop();
    if (!desktop || hiding) return;
    setHiding(true);
    try {
      await desktop.hideCompanion();
      setOverlayVisible(false);
    } finally {
      setHiding(false);
    }
  }

  async function endSession() {
    const desktop = getDesktop();
    if (!desktop?.endSession || ending) return;
    setEnding(true);
    try {
      const session = await desktop.endSession();
      setMeeting(session);
      setOverlayVisible(false);
    } finally {
      setEnding(false);
    }
  }

  async function fixPermission(kind: "microphone" | "screen" | "systemAudio") {
    const desktop = getDesktop();
    await desktop?.requestPermission?.(kind);
    if (desktop?.getPermissions) setPerms(await desktop.getPermissions());
  }

  const privacyOn = Boolean(capture?.applied || capture?.requested);
  const sessionActive = Boolean(meeting?.active);
  const overlayStatusLine = desktopReady
    ? [
        `Overlay ${overlayVisible ? "visible" : "hidden"}`,
        `Session ${sessionActive ? "active" : "idle"}${meeting?.title ? ` · ${meeting.title}` : ""}`,
        `Microphone ${listen.mic ? "ON" : "OFF"}`,
        `System audio ${listen.systemAudio ? "ON" : "OFF"}`,
        `Privacy ${privacyOn ? "ON" : "OFF"}`,
      ].join(" · ")
    : null;

  const micPerm = permissionCopy(
    perms?.microphone.state,
    "CueAI can access the microphone.",
    "Microphone permission is required on macOS.",
    "macOS will ask the first time CueAI uses the microphone.",
  );
  const systemPerm = permissionCopy(
    perms?.systemAudio.state,
    "CueAI can capture supported system/meeting audio.",
    "Screen Recording permission is required on macOS.",
    "System audio uses Screen Recording on macOS.",
    "✓ Available",
  );
  const screenPerm = permissionCopy(
    perms?.screenRecording.state,
    "CueAI can capture the selected display.",
    "Screen Recording permission is required on macOS.",
    "macOS will ask the first time CueAI captures the display.",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-up">
      <div>
        <Badge variant="info" className="mb-3">
          Desktop app · system-wide overlay
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          CueAI Desktop Companion
        </h1>
        <p className="mt-2 text-sm text-muted">
          Full requirements — always-on-top over other apps, screen-share privacy, and
          surviving a closed browser tab — need CueAI Desktop. The in-page overlay is a
          limited preview only.
        </p>
      </div>

      {mac && (
        <MacSegmentedControl
          value={view}
          onChange={setView}
          segments={[
            { id: "overlay", label: "Overlay" },
            { id: "capabilities", label: "Capabilities" },
          ]}
        />
      )}

      {(!mac || view === "overlay") && (
      <Card glow className={mac ? "mac-glass-card space-y-4 border-0 bg-transparent shadow-none" : "space-y-4"}>
        <CardHeader>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl btn-gradient text-white">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>
              {overlayVisible
                ? "Desktop Companion running · overlay visible"
                : lastResult?.issue
                  ? "Overlay failed to open."
                  : desktopReady
                    ? "CueAI Desktop is connected"
                    : "Install / open CueAI Desktop"}
            </CardTitle>
            <CardDescription>
              {overlayStatusLine
                ? overlayStatusLine
                : desktopReady
                  ? overlayVisible
                    ? "Native overlay is on screen. Use ⌘⇧Space or Ctrl+Shift+Space to hide or show it."
                    : "Open the native system-wide overlay (same window as ⌘⇧Space / Ctrl+Shift+Space)."
                  : "Start Desktop so the Companion can float above meetings and stay hidden from capture."}
            </CardDescription>
          </div>
        </CardHeader>

        {desktopReady === false && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/60 p-4 space-y-3">
            <p className="text-sm text-foreground font-medium">
              Open CueAI Desktop for system-wide overlay
            </p>
            <p className="text-xs text-muted leading-relaxed">
              From the repo root, run Desktop in a second terminal. Packaged installs
              register the <code className="text-foreground">{DESKTOP_PROTOCOL_COMPANION}</code>{" "}
              deep link so the site can wake the app.
            </p>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-3 font-mono text-sm">
              <p className="mb-2 flex items-center gap-2 text-xs text-subtle">
                <Terminal className="h-3.5 w-3.5" />
                Terminal
              </p>
              <p className="text-foreground">npm run dev:desktop</p>
            </div>
          </div>
        )}

        {desktopReady && !mac && (
          <p className="text-xs text-muted">
            Native overlay is always-on-top, excluded from capture when Privacy is on,
            and stays up after you close this website — dismiss only with End Session or
            Hide.
          </p>
        )}

        {lastResult?.mode === "web" && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--primary-muted)] px-3 py-2 text-xs text-muted">
            Showing the <span className="font-medium text-foreground">limited in-page preview</span>.
            It cannot cover other apps or hide from screen share.{" "}
            <button
              type="button"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
              onClick={() => tryDeepLink()}
            >
              Launch Desktop
            </button>
          </p>
        )}

        {lastResult?.mode === "launching" && (
          <p className="text-xs text-muted">
            Asked the OS to open CueAI via <code className="text-foreground">{DESKTOP_PROTOCOL_COMPANION}</code>.
            If nothing appears, start Desktop with <code className="text-foreground">npm run dev:mac</code> or <code className="text-foreground">npm run dev:desktop</code>.
          </p>
        )}

        {lastResult?.mode === "native" && !lastResult.issue && (
          <p className="text-xs text-muted">
            Native companion opened. It will keep running after this tab closes.
            Use <kbd className="rounded border border-[var(--border)] px-1">Ctrl+Shift+Space</kbd>{" "}
            or <kbd className="rounded border border-[var(--border)] px-1">Ctrl+Shift+C</kbd> to
            toggle it anytime.
          </p>
        )}

        {lastResult?.mode === "native" && lastResult.issue === "load_error" && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--primary-muted)] px-3 py-2 text-xs text-muted">
            Overlay failed to open
            {lastResult.loadError ? `: ${lastResult.loadError}` : "."} Keep CueAI Desktop running, then try again.
          </p>
        )}

        {lastResult?.mode === "native" && lastResult.issue === "not_visible" && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--primary-muted)] px-3 py-2 text-xs text-muted">
            Desktop received the open request but the overlay did not appear on screen. Try{" "}
            <kbd className="rounded border border-[var(--border)] px-1">Ctrl+Shift+Space</kbd>,
            check the system tray for CueAI, or restart{" "}
            <code className="text-foreground">npm run dev:desktop</code>.
          </p>
        )}

        {lastResult?.mode === "native" && lastResult.issue && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void tryOpenOverlay()}>
              Retry open overlay
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {mac ? (
            <MacGlassButton
              accent
              loading={opening}
              loadingLabel="Opening overlay..."
              disabled={opening}
              icon={<Layers className="h-4 w-4" />}
              onClick={() => void tryOpenOverlay()}
            >
              {lastResult?.issue
                ? "Try Again"
                : overlayVisible
                  ? "Overlay Open"
                  : desktopReady
                    ? "Open system-wide overlay"
                    : "Try open / launch Desktop"}
            </MacGlassButton>
          ) : (
            <Button
              variant="gradient"
              disabled={opening}
              onClick={() => void tryOpenOverlay()}
            >
              {opening
                ? "Opening…"
                : desktopReady
                  ? "Open system-wide overlay"
                  : "Try open / launch Desktop"}
            </Button>
          )}
          {!desktopReady && (
            <>
              <Button variant="outline" onClick={() => void copyLaunch()}>
                {copied ? "Copied" : "Copy launch command"}
              </Button>
              <Button variant="outline" onClick={() => tryDeepLink()}>
                Open via deep link
              </Button>
            </>
          )}
          {mac ? (
            <MacGlassButton
              icon={<ArrowUpRight className="h-4 w-4" />}
              onClick={() => {
                window.location.href = "/dashboard";
              }}
            >
              Back to dashboard
            </MacGlassButton>
          ) : (
            <Button href="/dashboard" variant="outline">
              Back to dashboard
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
      )}

      {mac && view === "overlay" && desktopReady && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ControlCard
            icon={Mic}
            title="Microphone"
            status={listen.mic ? "ON" : "OFF"}
            desc="Turn microphone capture on or off for the current overlay session."
          >
            <MacGlassToggle
              checked={listen.mic}
              onChange={(next) => void toggleMic(next)}
              label="Microphone"
            />
          </ControlCard>
          <ControlCard
            icon={Volume2}
            title="System audio"
            status={listen.systemAudio ? "ON" : "OFF"}
            desc="Turn system/meeting audio capture on or off for the overlay session."
          >
            <MacGlassToggle
              checked={listen.systemAudio}
              onChange={(next) => void toggleSystemAudio(next)}
              label="System audio"
            />
          </ControlCard>
          <ControlCard
            icon={EyeOff}
            title="Privacy mode"
            status={privacyOn ? "ON" : "OFF"}
            desc="Hide the overlay from screen share and capture when privacy is on."
          >
            <MacGlassToggle
              checked={privacyOn}
              onChange={(next) => void togglePrivacy(next)}
              label="Privacy mode"
            />
          </ControlCard>
          <ControlCard
            icon={Camera}
            title="Screen Context"
            status={shotMsg || "Ready"}
            desc="Capture a screenshot or open Screen Context for display analysis."
          >
            <MacGlassButton
              loading={shotBusy}
              loadingLabel="Capturing…"
              disabled={shotBusy}
              onClick={() => void takeScreenshot()}
            >
              Screenshot
            </MacGlassButton>
            <MacGlassButton
              onClick={() => {
                window.location.href = "/screen-context";
              }}
            >
              Screen Context
            </MacGlassButton>
          </ControlCard>
          <ControlCard
            icon={Minimize2}
            title="Hide overlay"
            status={overlayVisible ? "Visible" : "Hidden"}
            desc="Hide the system-wide overlay without ending the CueAI session."
          >
            <MacGlassButton
              loading={hiding}
              loadingLabel="Hiding…"
              disabled={hiding || !overlayVisible}
              onClick={() => void hideOverlay()}
            >
              Hide overlay
            </MacGlassButton>
          </ControlCard>
          <ControlCard
            icon={PhoneOff}
            title="End session"
            status={sessionActive ? "Session active" : "No active session"}
            desc="Stop the overlay session and return to live meetings."
          >
            <MacGlassButton
              loading={ending}
              loadingLabel="Ending…"
              disabled={ending}
              onClick={() => void endSession()}
            >
              End session
            </MacGlassButton>
          </ControlCard>
        </div>
      )}

      {mac && view === "capabilities" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              {
                icon: Layers,
                title: "Desktop Overlay",
                mark: desktopReady ? "✓ Available" : "⚠ Disconnected",
                desc: desktopReady
                  ? "CueAI Desktop can show a system-wide overlay on this computer."
                  : "CueAI Desktop is not connected on this computer.",
                settings: null as "microphone" | "screen" | "systemAudio" | null,
                fix: null as "microphone" | "screen" | "systemAudio" | null,
              },
              {
                icon: Mic,
                title: "Microphone",
                ...micPerm,
                settings: permissionAction(perms?.microphone.state) === "settings" ? "microphone" as const : null,
                fix: permissionAction(perms?.microphone.state) === "fix" ? "microphone" as const : null,
              },
              {
                icon: Volume2,
                title: "System Audio",
                ...systemPerm,
                settings: permissionAction(perms?.systemAudio.state) === "settings" ? "screen" as const : null,
                fix: permissionAction(perms?.systemAudio.state) === "fix" ? "systemAudio" as const : null,
              },
              {
                icon: Camera,
                title: "Screen Capture",
                ...screenPerm,
                settings: permissionAction(perms?.screenRecording.state) === "settings" ? "screen" as const : null,
                fix: permissionAction(perms?.screenRecording.state) === "fix" ? "screen" as const : null,
              },
              {
                icon: EyeOff,
                title: "Screen-share Privacy",
                mark: capture?.applied ? "✓ Enabled" : "⚠ Not enabled",
                desc: capture?.message || "Capture protection status comes from the live overlay.",
                settings: null,
                fix: null,
              },
              {
                icon: Shield,
                title: "Background Operation",
                mark: desktopReady ? "✓ Available" : "⚠ Disconnected",
                desc: desktopReady
                  ? "The overlay process stays up after this page is closed."
                  : "Start CueAI Desktop to keep the companion running in the background.",
                settings: null,
                fix: null,
              },
              {
                icon: Sparkles,
                title: "AI Connection",
                mark: backendOk
                  ? "✓ Connected"
                  : backendOk === false
                    ? "⚠ Disconnected"
                    : "Checking…",
                desc: backendOk
                  ? "The CueAI workspace API is reachable."
                  : "The workspace web server is not responding.",
                settings: null,
                fix: null,
              },
            ]
          ).map((row) => (
            <Card key={row.title} className="p-4">
              <row.icon className="mb-3 h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold">{row.title}</h3>
              <p className="mt-1 text-xs font-medium text-foreground">{row.mark}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{row.desc}</p>
              {row.fix ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                  onClick={() => void fixPermission(row.fix)}
                >
                  Fix
                </button>
              ) : null}
              {row.settings ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                  onClick={() => void getDesktop()?.openPrivacySettings?.(row.settings)}
                >
                  Open Settings
                </button>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {!mac && (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="p-4">
            <f.icon className="mb-3 h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{f.desc}</p>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
