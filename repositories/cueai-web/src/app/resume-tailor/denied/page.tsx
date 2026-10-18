"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function ResumeTailorDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Logo href="/" />
      <h1 className="text-2xl font-semibold tracking-tight">Resume Tailor is not available</h1>
      <p className="max-w-md text-sm text-muted">
        This CueAI account does not have access to Resume Tailor. Sign in with a User or Admin
        workspace account and try again.
      </p>
      <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
        Continue to CueAI
      </Link>
    </div>
  );
}
