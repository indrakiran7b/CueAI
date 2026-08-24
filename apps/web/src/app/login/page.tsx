"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock, ArrowRight, Sparkles } from "lucide-react";
import { loginWithEmail, AUTH_BYPASS } from "@/lib/auth";
import { useAuth } from "@/components/providers/auth-provider";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[var(--background-elevated)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="aurora absolute inset-0" />
        <div className="grid-fade absolute inset-0" />
        <Logo className="relative z-10" />
        <div className="relative z-10 max-w-md">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl btn-gradient shadow-lg shadow-teal-500/30">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h2 className="font-display text-4xl leading-tight tracking-tight">
            Welcome back to your workspace.
          </h2>
          <p className="mt-4 text-muted">
            Sign in with Google, GitHub, or the email you registered with.
          </p>
        </div>
        <p className="relative z-10 text-xs text-subtle">OAuth + email sign-in supported</p>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-muted">{footer}</div>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (AUTH_BYPASS) {
      refresh();
      router.replace("/dashboard");
    }
  }, [router, refresh]);

  useEffect(() => {
    const authError = searchParams.get("error");
    if (!authError) return;
    if (authError === "Configuration") {
      setError(
        "OAuth is not configured. Add Google/GitHub keys to .env.local and restart the server."
      );
    } else {
      setError("Sign-in failed. Please try again or use email.");
    }
  }, [searchParams]);

  if (AUTH_BYPASS) {
    return <div className="min-h-screen bg-background" />;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = loginWithEmail({
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    refresh();
    router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Sign in to your account"
      subtitle="Continue with Google or GitHub, or use email."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create your account
          </Link>
        </>
      }
    >
      <SocialAuthButtons callbackUrl="/dashboard" />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-3 text-subtle">or continue with email</span>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          label="Email"
          type="email"
          name="email"
          placeholder="you@company.com"
          autoComplete="email"
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
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" className="rounded border-[var(--border-strong)]" />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
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
          Sign in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}
