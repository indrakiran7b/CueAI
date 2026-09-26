"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock, User, ArrowRight, Sparkles, Eye, EyeOff } from "lucide-react";
import { signupWithEmailApi, AUTH_BYPASS } from "@/lib/auth";
import { CREDENTIALS_BYPASS } from "@/lib/auth-mode";
import { useAuth } from "@/components/providers/auth-provider";
import { SocialAuthButtons, MacAuthDivider } from "@/components/auth/social-auth-buttons";
import { persistDesktopQuery, withDesktopParam } from "@/lib/desktop-query";
import { persistProductFromSearch } from "@/lib/product-mode";
import { isMacDesktopApp } from "@/lib/desktop";
import { MacAuthShell, MacSignupForm } from "@/components/mac/mac-auth-screen";

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
        <Logo className="relative z-10" />
        <div className="relative z-10 max-w-md">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl btn-gradient">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h2 className="font-display text-4xl leading-tight tracking-tight">
            Create your own CueAI workspace.
          </h2>
          <p className="mt-4 text-muted">
            Continue with Google or Apple, or use email.
          </p>
        </div>
        <p className="relative z-10 text-xs text-subtle">OAuth + email signup supported</p>
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

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mac, setMac] = useState(searchParams.get("desktop") === "mac");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setMounted(true);
    persistDesktopQuery();
    persistProductFromSearch(searchParams.toString());
    setMac(isMacDesktopApp() || searchParams.get("desktop") === "mac");
  }, [searchParams]);

  useEffect(() => {
    if (AUTH_BYPASS) {
      void refresh();
      router.replace(withDesktopParam("/dashboard"));
    }
  }, [router, refresh]);

  if (AUTH_BYPASS) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!mounted) {
    return <div className="mac-auth-shell min-h-screen bg-background" />;
  }

  async function createAccount(fields: { name: string; email: string; password: string }) {
    setError(null);
    setLoading(true);

    try {
      const result = await signupWithEmailApi(fields);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await refresh();
      router.push(mac ? "/onboarding?desktop=mac" : withDesktopParam("/onboarding"));
    } catch {
      setError("Unable to reach auth server.");
    } finally {
      setLoading(false);
    }
  }

  if (mac) {
    return (
      <MacAuthShell
        title="Create your account"
        copy="Create your CueAI account to continue."
        footer={null}
      >
        <MacSignupForm error={error} loading={loading} onSubmit={createAccount} />
        <MacAuthDivider />
        <SocialAuthButtons
          appearance="mac"
          callbackUrl="/onboarding?desktop=mac"
          providers={["google", "apple"]}
        />
      </MacAuthShell>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirmPassword") || "");
    if (!CREDENTIALS_BYPASS && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    await createAccount({
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      password,
    });
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Continue with Google or Apple, or use email."
      footer={
        <>
          Already have an account?{" "}
          <Link href={withDesktopParam("/login")} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SocialAuthButtons callbackUrl="/onboarding" providers={["google", "apple"]} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-3 text-subtle">or sign up with email</span>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          label="Full name"
          name="name"
          placeholder={CREDENTIALS_BYPASS ? "Optional while testing" : "Your full name"}
          autoComplete="name"
          leftIcon={<User className="h-4 w-4" />}
          required={!CREDENTIALS_BYPASS}
        />
        <Input
          label="Work email"
          type={CREDENTIALS_BYPASS ? "text" : "email"}
          name="email"
          placeholder={CREDENTIALS_BYPASS ? "Optional while testing" : "you@company.com"}
          autoComplete="email"
          leftIcon={<Mail className="h-4 w-4" />}
          required={!CREDENTIALS_BYPASS}
        />
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          name="password"
          placeholder={CREDENTIALS_BYPASS ? "Optional while testing" : "At least 8 characters"}
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <button
              type="button"
              className="text-subtle transition hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          required={!CREDENTIALS_BYPASS}
          minLength={CREDENTIALS_BYPASS ? undefined : 8}
        />
        <Input
          label="Confirm password"
          type={showConfirm ? "text" : "password"}
          name="confirmPassword"
          placeholder={CREDENTIALS_BYPASS ? "Optional while testing" : "Re-enter password"}
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <button
              type="button"
              className="text-subtle transition hover:text-foreground"
              aria-label={showConfirm ? "Hide password" : "Show password"}
              onClick={() => setShowConfirm((v) => !v)}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          required={!CREDENTIALS_BYPASS}
          minLength={CREDENTIALS_BYPASS ? undefined : 8}
        />
        {CREDENTIALS_BYPASS && (
          <p className="text-xs text-subtle">
            Auth is bypassed in this test build — press Create my account to go straight to the
            setup questions.
          </p>
        )}
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
          Create my account
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  );
}
