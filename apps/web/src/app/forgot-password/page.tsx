"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

/**
 * Password reset / magic-link email delivery is not wired to a backend yet.
 * Do not pretend a link was sent.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="aurora absolute inset-0 opacity-50" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-8 shadow-[var(--shadow-lg)]">
        <Logo className="mb-8" />
        <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-2 text-sm text-muted">
          Email password reset and magic links are not available yet. Sign in
          with your existing email and password, or use Google/GitHub when
          configured.
        </p>
        <div className="mt-6 space-y-3">
          <Link href="/login" className="block">
            <Button variant="gradient" className="w-full">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Button>
          </Link>
          <Link href="/signup" className="block">
            <Button variant="outline" className="w-full">
              Create an account
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
