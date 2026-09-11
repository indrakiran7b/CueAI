"use client";

import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { BrandMark } from "@/components/ui/logo";
import { getDesktop, isDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";

/** Frameless window chrome — only rendered inside Electron. */
export function DesktopTitleBar() {
  const [visible, setVisible] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    setVisible(isDesktopApp());
    const desktop = getDesktop();
    if (!desktop) return;
    void desktop.isMaximized().then(setMaximized);
    return desktop.onMaximizedChange(setMaximized);
  }, []);

  if (!visible) return null;

  const desktop = getDesktop();

  return (
    <header
      className="flex h-10 shrink-0 items-center border-b border-[var(--border)] bg-[var(--background-elevated)]/90 px-3 backdrop-blur-xl"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <BrandMark size="sm" className="h-5 w-5" />
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
        <IconBtn label="Minimize" onClick={() => void desktop?.minimize()}>
          <Minus className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn label={maximized ? "Restore" : "Maximize"} onClick={() => void desktop?.maximize()}>
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </IconBtn>
        <IconBtn label="Close" danger onClick={() => void desktop?.close()}>
          <X className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
    </header>
  );
}

function IconBtn({
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
      className={cn(
        "rounded-lg p-1.5 text-muted transition hover:bg-[var(--surface-hover)] hover:text-foreground",
        danger && "hover:bg-red-500/20 hover:text-red-400"
      )}
    >
      {children}
    </button>
  );
}
