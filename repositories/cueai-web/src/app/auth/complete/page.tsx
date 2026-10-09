"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { isSafeInternalPath } from "@/lib/oauth-complete";
import { withDesktopParam } from "@/lib/desktop-query";

function OAuthCompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: nextAuthStatus } = useSession();
  const { session, status } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const raw = searchParams.get("next") || "/dashboard";
    return isSafeInternalPath(raw) ? raw : "/dashboard";
  }, [searchParams]);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace(withDesktopParam(nextPath));
      router.refresh();
    }
  }, [status, session, nextPath, router]);

  useEffect(() => {
    if (nextAuthStatus !== "unauthenticated") return;
    if (status === "authenticated") return;
    const timer = window.setTimeout(() => {
      setError(
        "Google sign-in did not finish. Confirm the Google Cloud redirect URI is the CueAI NextAuth callback, not an Appwrite URL, then try again.",
      );
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [nextAuthStatus, status]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      {error ? (
        <>
          <p className="max-w-md text-center text-sm text-[var(--cue-danger)]" role="alert">
            {error}
          </p>
          <Link href={withDesktopParam("/login")} className="text-sm text-primary hover:underline">
            Return to login
          </Link>
        </>
      ) : (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
          <p className="text-sm text-muted">Finishing sign-in…</p>
        </>
      )}
    </div>
  );
}

export default function OAuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          Finishing sign-in…
        </div>
      }
    >
      <OAuthCompleteInner />
    </Suspense>
  );
}
