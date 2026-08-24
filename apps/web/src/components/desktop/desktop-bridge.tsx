"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDesktop, isDesktopApp } from "@/lib/desktop";

/** Listens for tray / shortcut navigation events from Electron. */
export function DesktopBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktopApp()) return;
    const desktop = getDesktop();
    if (!desktop) return;

    const offNav = desktop.onNavigate((path) => {
      router.push(path);
    });

    const offShortcut = desktop.onShortcut((name) => {
      if (name === "command-palette") {
        // Existing topbar search is the command surface for MVP
        document.querySelector<HTMLButtonElement>("[data-command-trigger]")?.click();
      }
      if (name === "end-session") {
        window.dispatchEvent(new CustomEvent("cueai:end-session"));
      }
    });

    document.documentElement.dataset.desktop = "true";

    return () => {
      offNav();
      offShortcut();
      delete document.documentElement.dataset.desktop;
    };
  }, [router]);

  return null;
}
