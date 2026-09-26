"use client";

import { useEffect, useState } from "react";
import { getDesktop, isDesktopApp, isMacDesktopApp } from "@/lib/desktop";
import { DesktopWindowControls } from "@/components/desktop/window-controls";

/**
 * Frameless Electron window chrome — single title bar.
 * Window controls (− □ ×) live here at the absolute top-right (not in page content).
 */
export function DesktopTitleBar() {
  const [visible, setVisible] = useState(false);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    const macApp = isMacDesktopApp();
    const id = window.requestAnimationFrame(() => {
      setMac(macApp);
      setVisible(isDesktopApp() || macApp);
    });
    // Re-check shortly in case preload attaches after first paint.
    const t = window.setTimeout(() => {
      setMac(isMacDesktopApp());
      setVisible(isDesktopApp() || isMacDesktopApp());
    }, 250);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, []);

  if (!visible) return null;

  const desktop = getDesktop();

  function onDoubleClick() {
    void desktop?.maximize();
  }

  if (mac) {
    return (
      <header
        className="mac-titlebar"
        onDoubleClick={onDoubleClick}
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="mac-titlebar-title">CueAI</span>
        <DesktopWindowControls variant="mac" />
      </header>
    );
  }

  return (
    <header
      className="flex h-10 shrink-0 items-center border-b border-[var(--border)] bg-[var(--background-elevated)]/90 px-3 backdrop-blur-xl"
      onDoubleClick={onDoubleClick}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-tight">CueAI</span>
        <span className="rounded-md border border-teal-500/20 bg-teal-500/10 px-1.5 py-0.5 text-[10px] text-teal-300">
          Desktop
        </span>
      </div>

      <div
        className="ml-auto flex items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          aria-label="Open companion"
          className="rounded-lg px-2 py-1.5 text-[11px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
          onClick={() => void desktop?.toggleCompanion()}
        >
          Companion
        </button>
        <DesktopWindowControls variant="windows" />
      </div>
    </header>
  );
}
