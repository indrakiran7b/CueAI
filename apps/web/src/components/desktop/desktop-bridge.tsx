"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDesktop, isDesktopApp, isMacDesktopApp } from "@/lib/desktop";
import { persistDesktopQuery, withDesktopParam } from "@/lib/desktop-query";

/** Listens for tray / shortcut navigation events from Electron. */
export function DesktopBridge() {
  const router = useRouter();

  useEffect(() => {
    const mac = isMacDesktopApp();
    if (mac) {
      document.documentElement.dataset.desktop = "mac";
      document.title = "CueAI";
      persistDesktopQuery();
    }

    if (!isDesktopApp()) {
      if (mac) return;
      return;
    }
    const desktop = getDesktop();
    if (!desktop) return;

    if (!mac) {
      document.documentElement.dataset.desktop = "win";
    }
    document.title = "CueAI";

    const offNav = desktop.onNavigate
      ? desktop.onNavigate((path) => {
          router.push(withDesktopParam(path));
        })
      : () => {};

    const offShortcut = desktop.onShortcut
      ? desktop.onShortcut((name) => {
          if (name === "command-palette") {
            document.querySelector<HTMLButtonElement>("[data-command-trigger]")?.click();
          }
          if (name === "end-session") {
            window.dispatchEvent(new CustomEvent("cueai:end-session"));
          }
        })
      : () => {};

    return () => {
      offNav();
      offShortcut();
      delete document.documentElement.dataset.desktop;
    };
  }, [router]);

  return null;
}
