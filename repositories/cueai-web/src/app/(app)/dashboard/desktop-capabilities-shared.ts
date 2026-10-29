"use client";

import { useEffect, useState } from "react";
import { getDesktop, type CaptureStatus, type DesktopStatus } from "@/lib/desktop";
import { DESKTOP_FEATURES, type DesktopFeatureId } from "@/lib/desktop-features";

export type CapTone = "on" | "off" | "warn";

export type CapStatus = { text: string; tone: CapTone };

export type DesktopLive = {
  status: DesktopStatus | null;
  listen: { mic: boolean; systemAudio: boolean } | null;
  capture: CaptureStatus | null;
  screenshot: boolean;
};

export function useDesktopLive(): DesktopLive | null {
  const [live, setLive] = useState<DesktopLive | null>(null);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop?.getStatus) return;
    let cancelled = false;

    async function refresh() {
      const d = getDesktop();
      if (!d) return;
      const [status, listen, capture] = await Promise.all([
        d.getStatus().catch(() => null),
        d.getListenSources?.().catch(() => null) ?? Promise.resolve(null),
        d.getCaptureStatus?.().catch(() => null) ?? Promise.resolve(null),
      ]);
      if (!cancelled) {
        setLive({
          status,
          listen,
          capture,
          screenshot: Boolean(d.captureScreenshot),
        });
      }
    }

    void refresh();
    const offListen = desktop.onListenSources?.((listen) =>
      !cancelled && setLive((l) => (l ? { ...l, listen } : l)),
    );
    const offCapture = desktop.onCaptureStatus?.((capture) =>
      !cancelled && setLive((l) => (l ? { ...l, capture } : l)),
    );
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      offListen?.();
      offCapture?.();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return live;
}

export function featureStatusFor(id: DesktopFeatureId, live: DesktopLive): CapStatus | null {
  switch (id) {
    case "mic":
      return live.listen
        ? live.listen.mic
          ? { text: "Listening", tone: "on" }
          : { text: "Off", tone: "off" }
        : null;
    case "systemAudio":
      return live.listen
        ? live.listen.systemAudio
          ? { text: "Listening", tone: "on" }
          : { text: "Off", tone: "off" }
        : null;
    case "screenshot":
      return live.screenshot ? { text: "Available", tone: "on" } : null;
    case "alwaysOnTop":
      return live.status
        ? live.status.alwaysOnTop
          ? { text: "On", tone: "on" }
          : { text: "Off", tone: "off" }
        : null;
    case "screenSharePrivacy":
      if (!live.capture) return null;
      if (!live.capture.supported) return { text: "Not supported on this system", tone: "warn" };
      if (live.capture.applied) return { text: "Active", tone: "on" };
      if (live.capture.requested) return { text: "Requested, not applied", tone: "warn" };
      return { text: "Off", tone: "off" };
    case "background":
      return live.status ? { text: "Running in CueAI Desktop", tone: "on" } : null;
  }
}

/** Compact checklist label for the dashboard sidebar list. */
export function featureReadyLabel(id: DesktopFeatureId, live: DesktopLive | null): string {
  if (!live) return "Available in CueAI Desktop";
  const status = featureStatusFor(id, live);
  if (!status) return "—";
  if (status.tone === "on") {
    if (id === "screenshot") return "Available";
    if (id === "background") return "Running in CueAI Desktop";
    return "Ready";
  }
  if (status.tone === "warn") return status.text;
  return status.text;
}

export function isFeatureReady(id: DesktopFeatureId, live: DesktopLive | null): boolean {
  if (!live) return false;
  const s = featureStatusFor(id, live);
  return s?.tone === "on";
}

export { DESKTOP_FEATURES };
