"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Monitor,
  Sparkles,
  Terminal,
  Keyboard,
  Layers,
  ArrowUpRight,
  EyeOff,
  Shield,
} from "lucide-react";
import {
  DESKTOP_PROTOCOL_COMPANION,
  isDesktopAvailable,
  openCompanionOverlay,
  tryLaunchDesktopApp,
  type CompanionOpenResult,
} from "@/lib/desktop";

const features = [
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
    desc: "Toggle with Ctrl+Shift+Space / Ctrl+Shift+C without leaving your meeting.",
  },
  {
    icon: Sparkles,
    title: "Live AI answers",
    desc: "Transcript, mic indicators, pin/copy/regenerate, presenter mode.",
  },
];

export default function CompanionPage() {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const [desktopReady, setDesktopReady] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState<CompanionOpenResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isDesktopAvailable().then((ok) => {
      if (!cancelled) setDesktopReady(ok);
    });
    return () => {
      cancelled = true;
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
    const result = await openCompanionOverlay();
    setLastResult(result);
    if (result.mode === "native") {
      setDesktopReady(true);
    }
    setOpening(false);
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

      <Card glow className="space-y-4">
        <CardHeader>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl btn-gradient text-white">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>
              {desktopReady
                ? "Desktop is running"
                : "Install / open CueAI Desktop"}
            </CardTitle>
            <CardDescription>
              {desktopReady
                ? "Open the native system-wide overlay (same window as Ctrl+Shift+Space)."
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
            Close (X).
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
            Asked Windows to open CueAI via <code className="text-foreground">{DESKTOP_PROTOCOL_COMPANION}</code>.
            If nothing appears, start Desktop with <code className="text-foreground">npm run dev:desktop</code>.
          </p>
        )}

        {lastResult?.mode === "native" && (
          <p className="text-xs text-muted">
            Native companion opened. It will keep running after this tab closes.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
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
          <Button href="/dashboard" variant="outline">
            Back to dashboard
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="p-4">
            <f.icon className="mb-3 h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{f.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
