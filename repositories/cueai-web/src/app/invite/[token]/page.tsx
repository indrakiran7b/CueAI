"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

/**
 * Legacy /invite/[token] URLs redirect to normal login.
 * Membership is assigned immediately when an Admin sends an invite.
 */
export default function LegacyInviteRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/login"), 2500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <Logo />
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
        <p className="text-sm text-muted">
          Invitation acceptance links are no longer required. If an administrator added you to a
          workspace, sign in with that email to access your account and role.
        </p>
        <div className="flex justify-center gap-3">
          <Button href="/login" variant="gradient">
            Sign in
          </Button>
          <Button href="/signup" variant="secondary">
            Create password
          </Button>
        </div>
        <p className="text-xs text-subtle">
          Or go to <Link href="/login" className="underline">login</Link>
        </p>
      </div>
    </div>
  );
}
