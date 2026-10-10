"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

function DesktopGoogleStartInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get("state") || "";
  const { status } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("checking");

  useEffect(() => {
    if (!state) {
      setError("This desktop Google sign-in link is missing its authorization state.");
      return;
    }

    let cancelled = false;
    const completePath = `/auth/desktop/complete?state=${encodeURIComponent(state)}`;

    fetch(`/api/auth/desktop/google/status?state=${encodeURIComponent(state)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (!res.ok) {
          throw new Error(
            body.code === "google_not_configured"
              ? "Google sign-in is not configured on the CueAI server."
              : body.error || "This desktop Google sign-in request is not valid.",
          );
        }
        if (cancelled) return;
        if (status === "authenticated") {
          setStage("handoff");
          router.replace(completePath);
          return;
        }
        setStage("google");
        await signIn("google", {
          redirect: true,
          callbackUrl: completePath,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start Google sign-in.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state, status, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="max-w-md text-center text-sm text-[var(--cue-danger)]" role="alert">
          {error}
        </p>
        <p className="max-w-md text-center text-xs text-muted">
          Google must use the CueAI NextAuth callback, not an Appwrite URL. Return to CueAI Desktop and try again.
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Open CueAI login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      <p className="text-sm text-muted">
        {stage === "handoff"
          ? "Returning to CueAI Desktop…"
          : stage === "google"
            ? "Opening Google in this browser…"
            : "Checking this desktop sign-in request…"}
      </p>
    </div>
  );
}

export default function DesktopGoogleStartPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          Opening Google…
        </div>
      }
    >
      <DesktopGoogleStartInner />
    </Suspense>
  );
}
