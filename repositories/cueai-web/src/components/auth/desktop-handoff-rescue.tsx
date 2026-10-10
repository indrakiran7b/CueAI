"use client";

import { useEffect, useRef } from "react";

/**
 * If Google finished as a normal web login (/dashboard) while CueAI Desktop is
 * waiting, bind the open desktop ticket and return control to the app.
 */
export function DesktopHandoffRescue() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (typeof window !== "undefined" && (window as Window & { cueDesktop?: { isDesktop?: boolean } }).cueDesktop?.isDesktop) {
      return;
    }
    started.current = true;
    const begunAt = Date.now();

    void fetch("/api/auth/desktop/google/finish", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          deeplink?: string;
          loopbackUrl?: string;
          code?: string;
        };
        console.info("[auth] desktop.google.rescue", {
          stage: "browser_handoff",
          httpStatus: res.status,
          category: body.code || (res.ok ? "ok" : "fail"),
          callbackReceived: Boolean(body.deeplink),
          elapsedMs: Date.now() - begunAt,
        });
        if (!res.ok || !body.deeplink?.startsWith("cueai://auth/callback")) return;
        const target = body.loopbackUrl?.startsWith("http://127.0.0.1:")
          ? body.loopbackUrl
          : body.deeplink;
        window.location.replace(target);
      })
      .catch(() => {
        console.info("[auth] desktop.google.rescue", {
          stage: "browser_handoff",
          category: "network",
          callbackReceived: false,
          elapsedMs: Date.now() - begunAt,
        });
      });
  }, []);

  return null;
}
