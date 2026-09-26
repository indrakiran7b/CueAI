"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Monitor,
  RefreshCw,
  ScanText,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  captureDesktopScreenshot,
  getDesktop,
  isMacDesktopApp,
  listDesktopDisplays,
  openCompanionOverlay,
  pushCompanionAnswer,
  type CaptureDisplay,
} from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { RequireAdmin } from "@/components/auth/require-admin";

type AnalyzeStatus = "idle" | "analyzing" | "ready" | "error";

export default function ScreenContextPage() {
  const [enabled, setEnabled] = useState(false);
  const [privacy, setPrivacy] = useState(true);
  const [showPermission, setShowPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AnalyzeStatus>("idle");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [displays, setDisplays] = useState<CaptureDisplay[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | null>(null);
  const [permMsg, setPermMsg] = useState<string | null>(null);
  const mac = isMacDesktopApp();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listDesktopDisplays();
      if (cancelled) return;
      setDisplays(list);
      if (list.length) {
        const primary = list.find((d) => d.primary) || list[0];
        setSelectedDisplayId((prev) => prev ?? primary.id);
      }
    })();

    const desktop = getDesktop();
    if (desktop?.getPermissions) {
      void desktop.getPermissions().then((perms) => {
        if (!cancelled) setPermMsg(perms.screenRecording.message);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function capturePhysicalDisplay(): Promise<string | null> {
    const desktop = getDesktop();
    // Privacy = exclude CueAI from capture pipelines (never redact the user's screen).
    if (privacy && desktop?.setExcludeCapture) {
      try {
        await desktop.setExcludeCapture(true);
      } catch {
        /* best-effort */
      }
    }

    if (mac && desktop?.requestPermission) {
      const permission = await desktop.requestPermission("screen");
      setPermMsg(permission.message);
      if (permission.state === "denied" || permission.state === "restricted") {
        setAiStatus("error");
        setStatusLabel(permission.message);
        return null;
      }
    }

    console.log("[SCREEN] Capture requested");
    const selected = displays.find((d) => d.id === selectedDisplayId);
    console.log("[SCREEN] Selected display:", selected?.label || selectedDisplayId);

    const shot = await captureDesktopScreenshot({
      displayId: selectedDisplayId,
    });
    if (shot.ok && shot.dataUrl) {
      console.log("[SCREEN] Physical display screenshot captured", shot.meta);
      return shot.dataUrl;
    }
    if (desktop?.captureScreenshot) {
      console.error("[SCREEN] Capture failed", shot.error);
      return null;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => window.setTimeout(r, 200));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    return dataUrl;
  }

  async function captureAndAnalyze() {
    if (!enabled || busy) return;
    setBusy(true);
    setAiStatus("analyzing");
    setStatusLabel("Analyzing screen...");
    setAiAnswer(null);

    try {
      void openCompanionOverlay();
      const dataUrl = await capturePhysicalDisplay();
      if (!dataUrl) {
        setAiStatus("error");
        setStatusLabel((prev) => prev || "Unable to analyze the screen. Please try again.");
        setAiAnswer(null);
        return;
      }

      setPreviewUrl(privacy ? null : dataUrl);

      console.log("[SCREEN-AI] Vision request started");
      const res = await fetch("/api/live/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          prompt:
            "Analyze the screenshot of the user's physical display. Identify the visible question or task (e.g. Notepad, browser, IDE, PDF) and provide an accurate, concise answer. Ignore any CueAI UI if somehow present.",
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        ok?: boolean;
        answer?: string;
        error?: string;
      };

      if (!res.ok) {
        console.error("[SCREEN-AI] Vision failed", payload.error);
        setAiStatus("error");
        setStatusLabel(
          payload.error
            ? `Unable to analyze the screen. ${payload.error}`
            : "Unable to analyze the screen. Please try again.",
        );
        setAiAnswer(null);
        return;
      }

      let answer = payload.answer?.trim() || "";
      if (payload.jobId && !answer) {
        const { pollJobUntilDone } = await import("@/lib/poll-job");
        const job = await pollJobUntilDone({ jobId: payload.jobId });
        answer = job.result?.answer?.trim() || "";
        if (job.status === "failed" || !answer) {
          throw new Error(job.error || "Screen analysis failed");
        }
      }

      if (!answer) {
        console.error("[SCREEN-AI] Vision failed", payload.error);
        setAiStatus("error");
        setStatusLabel("Unable to analyze the screen. Please try again.");
        setAiAnswer(null);
        return;
      }

      console.log("[SCREEN-AI] First response received");
      setAiAnswer(answer);
      setAiStatus("ready");
      setStatusLabel("Answer ready");
      console.log("[SCREEN-AI] Answer rendered");

      await pushCompanionAnswer({
        answer,
        question: "Screen context",
        status: "ready",
      });
    } catch (err) {
      console.error("[SCREEN-AI] Failed", err);
      setAiStatus("error");
      setStatusLabel("Unable to analyze the screen. Please try again.");
      setAiAnswer(null);
    } finally {
      setBusy(false);
    }
  }

  const monitorOptions =
    displays.length > 0
      ? displays
      : ([
          {
            id: -1,
            label: "Built-in Display",
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            scaleFactor: 1,
            primary: true,
          },
        ] as CaptureDisplay[]);

  return (
    <RequireAdmin>
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Screen Context AI
          </h1>
          <p className="mt-1 text-sm text-muted">
            Opt-in visual context with OCR — never without your permission.
          </p>
        </div>
        <Button
          variant={enabled ? "danger" : "gradient"}
          onClick={() => {
            if (!enabled) setShowPermission(true);
            else setEnabled(false);
          }}
        >
          {enabled ? "Disable" : "Enable Screen AI"}
        </Button>
      </div>

      {showPermission && !enabled && (
        <Card glow className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-muted)] text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Allow screen capture?</h3>
              <p className="mt-1 text-sm text-muted">
                CueAI will analyze visible content to answer questions about what&apos;s
                on your screen. You can exclude apps and disable anytime. Data is not
                stored unless you pin an answer.
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={() => {
                    setEnabled(true);
                    setShowPermission(false);
                  }}
                >
                  Allow
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPermission(false)}
                >
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Screen preview</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={enabled ? "success" : "default"}>
                {busy ? "Analyzing" : enabled ? "Ready" : "Idle"}
              </Badge>
              <Badge variant="info">
                <ScanText className="h-3 w-3" />
                {busy
                  ? "Analyzing screen..."
                  : aiAnswer
                    ? "Screen analyzed"
                    : enabled
                      ? "OCR ready"
                      : "OCR off"}
              </Badge>
            </div>
          </div>
          <div
            className="relative flex aspect-video items-center justify-center bg-[var(--background-secondary,var(--background))]"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Captured physical display"
                className="absolute inset-0 h-full w-full object-contain object-top"
              />
            ) : (
              <>
                <div className="absolute inset-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-gradient-to-br from-teal-500/10 via-transparent to-violet-500/10">
                  <div className="absolute left-4 top-4 h-3 w-32 rounded bg-white/10" />
                  <div className="absolute left-4 top-10 h-2 w-48 rounded bg-white/5" />
                  <div className="absolute bottom-4 left-4 right-4 h-20 rounded-lg border border-white/10 bg-white/5" />
                  {enabled && (
                    <div className="absolute right-4 top-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[10px] text-teal-300">
                      Ready · physical display capture
                    </div>
                  )}
                </div>
                <p className="relative z-10 px-6 text-center text-sm text-muted">
                  {!enabled
                    ? "Enable Screen AI to preview context"
                    : busy
                      ? "Analyzing screen..."
                      : "Screen preview"}
                </p>
              </>
            )}
          </div>
          <div className="flex gap-2 border-t border-[var(--border)] p-3">
            <Button
              variant="outline"
              size="sm"
              disabled={!enabled || busy}
              loading={busy}
              onClick={() => void captureAndAnalyze()}
            >
              Analyze Screen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!enabled || busy}
              onClick={() => void captureAndAnalyze()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setPrivacy((p) => !p)}
              title="Privacy excludes CueAI from capture — your screen content stays readable for analysis"
            >
              {privacy ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Privacy {privacy ? "on" : "off"}
            </Button>
          </div>

          {aiStatus !== "idle" && (
            <div className="space-y-2 border-t border-[var(--border)] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  AI Answer
                </p>
                {statusLabel && (
                  <span
                    className={cn(
                      "text-[11px]",
                      aiStatus === "error" ? "text-red-300" : "text-muted"
                    )}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>
              {aiStatus === "analyzing" && (
                <p className="text-sm text-muted">Analyzing screen...</p>
              )}
              {aiStatus === "error" && (
                <p className="text-sm text-red-300">
                  {statusLabel || "Unable to analyze the screen. Please try again."}
                </p>
              )}
              {aiStatus === "ready" && aiAnswer && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {aiAnswer}
                </p>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <CardTitle className="mb-3">Display selection</CardTitle>
            <div className="space-y-2">
              {monitorOptions.map((m) => {
                const checked =
                  selectedDisplayId != null
                    ? selectedDisplayId === m.id
                    : Boolean(m.primary);
                return (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--surface-hover)]"
                  >
                    <input
                      type="radio"
                      name="monitor"
                      checked={checked}
                      onChange={() => setSelectedDisplayId(m.id)}
                      disabled={m.id < 0}
                    />
                    <span className="flex-1">
                      {m.label}
                      {m.scaleFactor > 1 ? ` · ${m.scaleFactor}x` : ""}
                    </span>
                    {m.primary && (
                      <span className="text-[10px] uppercase tracking-wide text-muted">
                        Primary
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {permMsg && <p className="mt-3 text-xs text-muted">{permMsg}</p>}
            {displays.length === 0 && (
              <p className="mt-3 text-xs text-muted">
                Open CueAI Desktop to list physical monitors and capture your screen.
              </p>
            )}
            {mac && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => void getDesktop()?.openPrivacySettings?.("screen")}
              >
                Open System Settings
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <CardTitle className="mb-3">Capture notes</CardTitle>
            <p className="text-xs leading-relaxed text-muted">
              CueAI captures the selected physical display, hides CueAI windows for the
              shot, and sends that image to the existing vision pipeline. The overlay is
              excluded where macOS content protection allows. Some ScreenCaptureKit paths
              may still see protected windows.
            </p>
          </Card>
        </div>
      </div>
    </div>
    </RequireAdmin>
  );
}
