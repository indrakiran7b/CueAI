"use client";

import { useEffect, useState } from "react";
import { getDesktop, type CaptureStatus, type DesktopStatus } from "@/lib/desktop";
import { DESKTOP_FEATURES, type DesktopFeatureId } from "@/lib/desktop-features";

type Tone = "on" | "off" | "warn";
type FeatureStatus = { text: string; tone: Tone };

type Live = {
  status: DesktopStatus | null;
  listen: { mic: boolean; systemAudio: boolean } | null;
  capture: CaptureStatus | null;
  screenshot: boolean;
};

/** Reads real state from the CueAI Desktop bridge. Outside the desktop app nothing is reported. */
function useDesktopLive(): Live | null {
  const [live, setLive] = useState<Live | null>(null);

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
      if (!cancelled) setLive({ status, listen, capture, screenshot: Boolean(d.captureScreenshot) });
    }

    void refresh();
    const offListen = desktop.onListenSources?.((listen) => !cancelled && setLive((l) => (l ? { ...l, listen } : l)));
    const offCapture = desktop.onCaptureStatus?.((capture) => !cancelled && setLive((l) => (l ? { ...l, capture } : l)));
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

function statusFor(id: DesktopFeatureId, live: Live): FeatureStatus | null {
  switch (id) {
    case "mic":
      return live.listen ? (live.listen.mic ? { text: "Listening", tone: "on" } : { text: "Off", tone: "off" }) : null;
    case "systemAudio":
      return live.listen
        ? live.listen.systemAudio
          ? { text: "Listening", tone: "on" }
          : { text: "Off", tone: "off" }
        : null;
    case "screenshot":
      return live.screenshot ? { text: "Available", tone: "on" } : null;
    case "alwaysOnTop":
      return live.status ? (live.status.alwaysOnTop ? { text: "On", tone: "on" } : { text: "Off", tone: "off" }) : null;
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

export function DesktopFeatureCards() {
  const live = useDesktopLive();

  return (
    <section className="db-features-wrap" aria-labelledby="db-features-title">
      <div className="db-panel-head db-features-head">
        <div>
          <h2 id="db-features-title" className="db-section-title">
            Desktop capabilities
          </h2>
          <p className="db-section-sub">
            {live ? "Live status from CueAI Desktop on this computer." : "Available in the CueAI Desktop app."}
          </p>
        </div>
      </div>
      <ul className="db-features">
        {DESKTOP_FEATURES.map((f) => {
          const status = live ? statusFor(f.id, live) : null;
          return (
            <li key={f.id} className="db-feature">
              <span className="db-feature-icon" aria-hidden>
                <f.icon className="h-[18px] w-[18px]" />
              </span>
              <h3 className="db-feature-title">{f.title}</h3>
              <p className="db-feature-desc">{f.desc}</p>
              {status && (
                <p className={`db-feature-status db-feature-status-${status.tone}`}>
                  <span className="sr-only">Status: </span>
                  {status.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
