"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { syncOAuthMembership } from "@/lib/auth";

function DesktopGoogleCompleteInner() {
  const searchParams = useSearchParams();
  const state = searchParams.get("state") || "";
  const { status, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"waiting" | "finishing" | "returning">("waiting");
  const [returnHref, setReturnHref] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!state) {
      setError("This desktop Google sign-in link is missing its authorization state.");
      return;
    }

    let cancelled = false;
    const started = Date.now();

    async function finishHandoff() {
      setStage("finishing");
      let authed = status === "authenticated";
      if (!authed) {
        const linked = await syncOAuthMembership();
        if (linked.ok) {
          await refresh();
          authed = true;
        }
      }
      if (!authed) {
        if (Date.now() - started < 12000) {
          window.setTimeout(() => {
            if (!cancelled) void finishHandoff();
          }, 400);
        } else {
          setError("Sign in completed in the browser, but CueAI could not create a desktop handoff. Return to CueAI Desktop and try again.");
        }
        return;
      }

      const res = await fetch("/api/auth/desktop/google/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        deeplink?: string;
        loopbackUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.deeplink?.startsWith("cueai://auth/callback")) {
        throw new Error(body.error || "Could not finish desktop Google sign-in.");
      }
      if (cancelled) return;
      const target = body.loopbackUrl?.startsWith("http://127.0.0.1:")
        ? body.loopbackUrl
        : body.deeplink;
      setReturnHref(body.deeplink);
      setStage("returning");
      window.location.replace(target);
    }

    if (status === "loading") return;
    if (startedRef.current && stage !== "waiting") return;
    startedRef.current = true;
    void finishHandoff().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Desktop handoff failed.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refresh, state, status]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="max-w-md text-center text-sm text-[var(--cue-danger)]" role="alert">
          {error}
        </p>
        <p className="max-w-md text-center text-xs text-muted">
          CueAI Desktop is still waiting. Close this tab and try Continue with Google from the app.
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Stay in the browser
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      <p className="text-sm text-muted">
        {stage === "returning"
          ? "Returning to CueAI Desktop…"
          : stage === "finishing"
            ? "Creating a one-time desktop authorization…"
            : "Finishing desktop sign-in…"}
      </p>
      {stage === "returning" ? (
        <>
          <p className="max-w-md text-center text-xs text-muted">
            If CueAI Desktop does not open, switch back to the app. This browser tab can be closed.
          </p>
          {returnHref ? (
            <a href={returnHref} className="text-sm text-primary hover:underline">
              Open CueAI Desktop
            </a>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function DesktopGoogleCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          Finishing desktop sign-in…
        </div>
      }
    >
      <DesktopGoogleCompleteInner />
    </Suspense>
  );
}
