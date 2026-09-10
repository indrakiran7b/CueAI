"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Lock, Mail, Shield } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import {
  ADMIN_BOOTSTRAP,
  loginAdmin,
  type AdminSession,
} from "@/lib/admin-auth";

export function AdminLoginForm({
  onSuccess,
}: {
  onSuccess: (session: AdminSession) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = loginAdmin({
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    onSuccess(result.session);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[var(--background-elevated)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="aurora absolute inset-0" />
        <div className="grid-fade absolute inset-0" />
        <Logo className="relative z-10" href="/" />
        <div className="relative z-10 max-w-md">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl btn-gradient shadow-lg shadow-teal-500/30">
            <Shield className="h-6 w-6 text-[var(--primary-foreground)]" />
          </div>
          <h2 className="font-display text-4xl leading-tight tracking-tight">
            CueAI Admin Portal
          </h2>
          <p className="mt-4 text-muted">
            Sign in with an Admin or Manager account to manage workspace users, AI,
            knowledge, and usage.
          </p>
        </div>
        <p className="relative z-10 text-xs text-subtle">
          Default bootstrap: {ADMIN_BOOTSTRAP.email} / {ADMIN_BOOTSTRAP.password}
        </p>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo href="/" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin sign in</h1>
          <p className="mt-1.5 text-sm text-muted">
            Access the workspace administration console.
          </p>
          <div className="mt-8 space-y-6">
            <SocialAuthButtons callbackUrl="/admin" />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-background px-3 text-subtle">
                  or continue with email
                </span>
              </div>
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <Input
                label="Email"
                type="email"
                name="email"
                placeholder="admin@company.com"
                autoComplete="username"
                defaultValue={ADMIN_BOOTSTRAP.email}
                leftIcon={<Mail className="h-4 w-4" />}
                required
              />
              <Input
                label="Password"
                type="password"
                name="password"
                placeholder="••••••••"
                autoComplete="current-password"
                leftIcon={<Lock className="h-4 w-4" />}
                required
              />
              {error && (
                <p className="text-sm text-[var(--cue-danger)]" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                variant="gradient"
                className="w-full"
                size="lg"
                loading={loading}
                disabled={loading}
              >
                Sign in to Admin
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
