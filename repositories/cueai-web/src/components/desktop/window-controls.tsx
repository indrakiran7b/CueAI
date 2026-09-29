"use client";

import { useEffect, useState } from "react";
import { getDesktop, isDesktopApp, isMacDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";

/**
 * Frameless Electron window controls (IPC → main process).
 * Single set: rendered from DesktopTitleBar (Windows + macOS).
 */
export function DesktopWindowControls({
  className,
  variant = "windows",
}: {
  className?: string;
  variant?: "windows" | "mac";
}) {
  const [ready, setReady] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const attach = () => {
      if (cancelled) return;
      if (!isDesktopApp() && !isMacDesktopApp()) return;
      const desktop = getDesktop();
      if (!desktop?.minimize || !desktop.maximize || !desktop.close) return;
      setReady(true);
      if (desktop.isMaximized && desktop.onMaximizedChange) {
        void desktop.isMaximized().then((v) => {
          if (!cancelled) setMaximized(v);
        });
        unsub = desktop.onMaximizedChange((v) => {
          if (!cancelled) setMaximized(v);
        });
      }
    };

    const id = window.requestAnimationFrame(attach);
    const t1 = window.setTimeout(attach, 100);
    const t2 = window.setTimeout(attach, 500);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      unsub?.();
    };
  }, []);

  if (!ready) return null;

  const desktop = getDesktop();
  if (!desktop?.minimize || !desktop.maximize || !desktop.close) return null;

  function onMaximizeOrRestore() {
    if (maximized && desktop?.restore) {
      void desktop.restore().then((stillMax) => {
        if (typeof stillMax === "boolean") setMaximized(stillMax);
      });
      return;
    }
    void desktop?.maximize().then((nowMax) => {
      if (typeof nowMax === "boolean") setMaximized(nowMax);
    });
  }

  if (variant === "mac") {
    return (
      <div
        className={cn("mac-titlebar-controls", className)}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <MacChromeBtn
          label="Minimize window"
          onClick={() => void desktop.minimize()}
        >
          −
        </MacChromeBtn>
        <MacChromeBtn
          label={maximized ? "Restore window" : "Maximize window"}
          onClick={onMaximizeOrRestore}
        >
          {maximized ? "❐" : "□"}
        </MacChromeBtn>
        <MacChromeBtn label="Close window" danger onClick={() => void desktop.close()}>
          ×
        </MacChromeBtn>
      </div>
    );
  }

  return (
    <div
      className={cn("ml-1 flex items-center", className)}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <WinChromeBtn
        label="Minimize window"
        onClick={() => void desktop.minimize()}
      >
        −
      </WinChromeBtn>
      <WinChromeBtn
        label={maximized ? "Restore window" : "Maximize window"}
        onClick={onMaximizeOrRestore}
      >
        {maximized ? "❐" : "□"}
      </WinChromeBtn>
      <WinChromeBtn label="Close window" danger onClick={() => void desktop.close()}>
        ×
      </WinChromeBtn>
    </div>
  );
}

function MacChromeBtn({
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
          ? "mac-chrome-btn mac-chrome-btn-close"
          : "mac-chrome-btn"
      }
    >
      <span aria-hidden>{children}</span>
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
          ? "flex h-9 w-10 items-center justify-center rounded-lg text-base text-muted transition hover:bg-red-500/20 hover:text-red-400"
          : "flex h-9 w-10 items-center justify-center rounded-lg text-base text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
