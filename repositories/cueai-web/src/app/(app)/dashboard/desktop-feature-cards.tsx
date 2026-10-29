"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DesktopCapabilitiesModal } from "./desktop-capabilities-modal";
import {
  DESKTOP_FEATURES,
  featureReadyLabel,
  isFeatureReady,
  useDesktopLive,
} from "./desktop-capabilities-shared";

/** Compact dashboard panel + modal with full capability grid. */
export function DesktopCapabilitiesPanel() {
  const live = useDesktopLive();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <section className="db-panel db-caps-panel" aria-labelledby="db-features-title">
        <div className="db-panel-head">
          <div>
            <h2 id="db-features-title" className="db-section-title">
              Desktop capabilities
            </h2>
            <p className="db-section-sub">
              {live ? "Live status from CueAI Desktop on this computer." : "Available in the CueAI Desktop app."}
            </p>
          </div>
        </div>
        <ul className="db-caps-list">
          {DESKTOP_FEATURES.map((f) => {
            const ready = isFeatureReady(f.id, live);
            const label = featureReadyLabel(f.id, live);
            return (
              <li key={f.id} className="db-caps-row">
                <span
                  className={cn(
                    "db-caps-check",
                    ready && "is-ready",
                    !live && "is-muted",
                  )}
                  aria-hidden
                >
                  {ready ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="db-caps-name">{f.title}</span>
                <span className={cn("db-caps-state", ready && "is-ready")}>{label}</span>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="db-caps-details-btn"
          onClick={() => setModalOpen(true)}
        >
          View capability details
          <ChevronRight className="h-4 w-4" />
        </button>
      </section>
      <DesktopCapabilitiesModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

/** @deprecated Use DesktopCapabilitiesPanel */
export function DesktopFeatureCards() {
  return <DesktopCapabilitiesPanel />;
}
