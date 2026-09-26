"use client";

import { useEffect, useState } from "react";
import { getDesktop, isDesktopApp, isMacDesktopApp } from "@/lib/desktop";

/** Frameless window chrome — only rendered inside Electron. */
export function DesktopTitleBar() {
  const [visible, setVisible] = useState(false);
  const [mac, setMac] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const desktop = getDesktop();
    const macApp = isMacDesktopApp();
    const id = window.requestAnimationFrame(() => {
      setMac(macApp);
      setVisible(isDesktopApp() || macApp);
    });
    if (!desktop?.isMaximized || !desktop.onMaximizedChange) {
      return () => window.cancelAnimationFrame(id);
    }
    void desktop.isMaximized().then(setMaximized);
    const unsub = desktop.onMaximizedChange(setMaximized);
    return () => {
      window.cancelAnimationFrame(id);
      unsub();
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
        <div
          className="mac-titlebar-controls"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <TrafficLight
            kind="min"
            glyph="−"
            label="Minimize"
            onClick={() => void desktop?.minimize()}
          />
          <TrafficLight
            kind="max"
            glyph={maximized ? "❐" : "□"}
            label={maximized ? "Restore" : "Maximize"}
            onClick={() => void desktop?.maximize()}
          />
          <TrafficLight
            kind="close"
            glyph="×"
            label="Close"
            onClick={() => void desktop?.close()}
          />
        </div>
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
        <WinChromeBtn label="Minimize" onClick={() => void desktop?.minimize()}>
          −
        </WinChromeBtn>
        <WinChromeBtn label={maximized ? "Restore" : "Maximize"} onClick={() => void desktop?.maximize()}>
          {maximized ? "❐" : "□"}
        </WinChromeBtn>
        <WinChromeBtn label="Close" danger onClick={() => void desktop?.close()}>
          ×
        </WinChromeBtn>
      </div>
    </header>
  );
}

function TrafficLight({
  kind,
  glyph,
  label,
  onClick,
}: {
  kind: "min" | "max" | "close";
  glyph: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`mac-traffic ${kind}`}
      onClick={onClick}
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}

function WinChromeBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={
        danger
          ? "rounded-lg px-2 py-1.5 text-muted transition hover:bg-red-500/20 hover:text-red-400"
          : "rounded-lg px-2 py-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
