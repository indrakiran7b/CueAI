"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MacGlassButton, MacSegmentedControl } from "@/components/mac";
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
} from "@/lib/desktop";

type BridgeStatus = {
  ok?: boolean;
  visible?: boolean;
  loadError?: string | null;
  bounds?: { width: number; height: number } | null;
};

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

function permissionHeadline(state: MacPermissionState | undefined) {
  if (state === "granted") return "Permission granted";
  if (state === "denied" || state === "restricted") return "Permission required";
  if (state === "not-determined") return "Permission not requested";
  if (state === "unknown") return "Status unknown";
  return "Checking…";
}

function permissionVariant(state: MacPermissionState | undefined): "success" | "warning" | "info" {
  if (state === "granted") return "success";
  if (state === "denied" || state === "restricted") return "warning";
  return "info";
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
  const [aiReady, setAiReady] = useState<boolean | null>(null);

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
          if (desktop.getPermissions) {
            const snap = await desktop.getPermissions();
            if (!cancelled) setPerms(snap);
          }
          if (desktop.getCaptureStatus) {
            const cap = await desktop.getCaptureStatus();
            if (!cancelled) setCapture(cap);
          }
        } catch {
          if (!cancelled) setDesktopReady(false);
        }
        try {
          const res = await fetch("/api/auth/providers", { method: "GET" });
          if (!cancelled) setAiReady(res.ok);
        } catch {
          if (!cancelled) setAiReady(false);
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

    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
        <>
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
              {desktopReady
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

        {desktopReady && (
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

      <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${mac && view === "overlay" ? "opacity-80" : ""}`}>
        {features.map((f) => (
          <Card key={f.title} className="p-4">
            <f.icon className="mb-3 h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{f.desc}</p>
          </Card>
        ))}
      </div>
        </>
      )}

      {mac && view === "capabilities" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              {
                icon: Layers,
                title: "Desktop Overlay",
                badge: overlayVisible ? "Available" : desktopReady ? "Ready" : "Not running",
                variant: overlayVisible ? "success" : desktopReady ? "info" : "warning",
                desc: overlayVisible
                  ? "CueAI desktop overlay is running."
                  : desktopReady
                    ? "CueAI Desktop is connected. Open the overlay from the Overlay tab when you need it."
                    : "CueAI Desktop is not connected.",
              },
              {
                icon: Mic,
                title: "Microphone",
                badge: permissionHeadline(perms?.microphone.state),
                variant: permissionVariant(perms?.microphone.state),
                desc:
                  perms?.microphone.message ||
                  "CueAI can access the microphone when permission is granted.",
                settings: "microphone" as const,
                needsSettings:
                  perms?.microphone.state === "denied" || perms?.microphone.state === "restricted",
              },
              {
                icon: Volume2,
                title: "System Audio",
                badge: permissionHeadline(perms?.systemAudio.state),
                variant: permissionVariant(perms?.systemAudio.state),
                desc:
                  perms?.systemAudio.message ||
                  "CueAI can capture supported system/meeting audio when Screen Recording is allowed.",
                settings: "systemAudio" as const,
                needsSettings:
                  perms?.systemAudio.state === "denied" || perms?.systemAudio.state === "restricted",
              },
              {
                icon: Camera,
                title: "Screen Recording",
                badge: permissionHeadline(perms?.screenRecording.state),
                variant: permissionVariant(perms?.screenRecording.state),
                desc:
                  perms?.screenRecording.message ||
                  "Screen Recording permission is required on macOS.",
                settings: "screen" as const,
                needsSettings:
                  perms?.screenRecording.state === "denied" ||
                  perms?.screenRecording.state === "restricted",
              },
              {
                icon: Shield,
                title: "Privacy",
                badge: !capture
                  ? "Checking…"
                  : !capture.supported
                    ? "Unavailable"
                    : capture.applied
                      ? "Enabled"
                      : "Disabled",
                variant: !capture
                  ? "info"
                  : !capture.supported
                    ? "warning"
                    : capture.applied
                      ? "success"
                      : "info",
                desc:
                  capture?.message ||
                  "Capture protection hides the overlay from screen share when Privacy is on.",
              },
              {
                icon: EyeOff,
                title: "Background desktop operation",
                badge: desktopReady ? "Available" : "Not running",
                variant: desktopReady ? "success" : "warning",
                desc: desktopReady
                  ? "CueAI Desktop stays running after this page closes until you end the session."
                  : "Start CueAI Desktop for background overlay operation.",
              },
              {
                icon: Sparkles,
                title: "AI / backend connection",
                badge: aiReady ? "Connected" : aiReady === false ? "Unavailable" : "Checking…",
                variant: aiReady ? "success" : aiReady === false ? "warning" : "info",
                desc: aiReady
                  ? "CueAI can reach the transcription and answer backend."
                  : aiReady === false
                    ? "The CueAI web API is not reachable from this session."
                    : "Checking the CueAI backend…",
              },
            ] as const
          ).map((item) => (
            <Card key={item.title} className="p-4">
              <item.icon className="mb-3 h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <Badge variant={item.variant} className="mt-2">
                {item.badge}
              </Badge>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.desc}</p>
              {"needsSettings" in item && item.needsSettings ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    void getDesktop()?.openPrivacySettings?.(
                      "settings" in item ? item.settings : "privacy",
                    )
                  }
                >
                  Open System Settings
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
