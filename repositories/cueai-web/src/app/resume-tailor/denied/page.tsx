"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function ResumeTailorDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Logo href="/" />
      <h1 className="text-2xl font-semibold tracking-tight">Resume Tailor is not available</h1>
      <p className="max-w-md text-sm text-muted">
        Resume Tailor is a web-only product. Sign in with your CueAI account in a browser to
        continue. It is not available inside the Windows or macOS desktop apps.
      </p>
      <Link href="/login?product=cueai" className="text-sm font-medium text-primary hover:underline">
        Continue to CueAI
      </Link>
    </div>
  );
}
