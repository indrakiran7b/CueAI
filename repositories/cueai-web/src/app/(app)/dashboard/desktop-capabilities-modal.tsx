"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import {
  DESKTOP_FEATURES,
  featureStatusFor,
  useDesktopLive,
} from "./desktop-capabilities-shared";

export function DesktopCapabilitiesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const live = useDesktopLive();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="db-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="db-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-cap-modal-title"
      >
        <header className="db-modal-head">
          <div>
            <h2 id="db-cap-modal-title" className="db-modal-title">
              Desktop capabilities
            </h2>
            <p className="db-modal-sub">
              {live
                ? "Live status from CueAI Desktop on this computer."
                : "Available in the CueAI Desktop app."}
            </p>
          </div>
          <button type="button" className="db-modal-close" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <ul className="db-modal-grid">
          {DESKTOP_FEATURES.map((f) => {
            const status = live ? featureStatusFor(f.id, live) : null;
            return (
              <li key={f.id} className="db-modal-card">
                <span className="db-feature-icon" aria-hidden>
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="db-feature-title">{f.title}</h3>
                <p className="db-feature-desc">{f.desc}</p>
                {status ? (
                  <p className={`db-feature-status db-feature-status-${status.tone}`}>
                    <span className="sr-only">Status: </span>
                    {status.text}
                  </p>
                ) : (
                  <p className="db-feature-status db-feature-status-off">
                    Open CueAI Desktop to see status
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
