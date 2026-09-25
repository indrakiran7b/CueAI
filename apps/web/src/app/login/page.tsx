"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock, ArrowRight, Sparkles, Shield, Eye, EyeOff } from "lucide-react";
import { loginWithEmailApi, AUTH_BYPASS } from "@/lib/auth";
import { CREDENTIALS_BYPASS } from "@/lib/auth-mode";
import { useAuth } from "@/components/providers/auth-provider";
import { SocialAuthButtons, MacAuthDivider } from "@/components/auth/social-auth-buttons";
import { canAccessAdmin } from "@/lib/roles";
import { persistDesktopQuery, withDesktopParam } from "@/lib/desktop-query";
import { isMacDesktopApp } from "@/lib/desktop";
import { MacAuthShell, MacLoginForm } from "@/components/mac/mac-auth-screen";

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
            Continue with Google or Apple, or use email.
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
  const { refresh, session, ready } = useAuth();
  const [loading, setLoading] = useState<"user" | "admin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mac, setMac] = useState(searchParams.get("desktop") === "mac");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    setMounted(true);
    persistDesktopQuery();
    setMac(isMacDesktopApp() || searchParams.get("desktop") === "mac");
  }, [searchParams]);

  useEffect(() => {
    if (AUTH_BYPASS) {
      void refresh();
      router.replace(withDesktopParam("/dashboard"));
    }
  }, [router, refresh]);

  useEffect(() => {
    if (ready && session && !AUTH_BYPASS) {
      router.replace(mac ? "/dashboard?desktop=mac" : withDesktopParam("/dashboard"));
    }
  }, [ready, session, router, mac]);

  useEffect(() => {
    const authError = searchParams.get("error");
    if (!authError) return;
    if (authError === "Configuration") {
      setError(
        "OAuth is not configured on the server. Add the Google or Apple keys and restart CueAI."
      );
    } else if (authError === "AccessDenied" || authError === "OAuthCallbackError") {
      setError("Sign-in was cancelled.");
    } else if (authError === "OAuthAccountNotLinked") {
      setError("An account already exists with this email. Sign in with email, then use the same verified address.");
    } else if (authError === "Callback" || authError === "OAuthCallback") {
      setError("OAuth failed. Check your connection and try again.");
    } else {
      setError("Sign-in failed. Please try again or use email.");
    }
  }, [searchParams]);

  if (AUTH_BYPASS) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!mounted) {
    return <div className="mac-auth-shell min-h-screen bg-background" />;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await signIn("user");
  }

  async function signIn(destination: "user" | "admin") {
    setError(null);
    setLoading(destination);

    const form = document.getElementById("login-form") as HTMLFormElement | null;
    if (!CREDENTIALS_BYPASS && !form?.reportValidity()) {
      setLoading(null);
      return;
    }
    const data = new FormData(form ?? undefined);
    try {
      const result = await loginWithEmailApi({
        email: String(data.get("email") || ""),
        password: String(data.get("password") || ""),
      });

      if (!result.ok) {
        setError(result.error);
        setLoading(null);
        return;
      }

      // Await so the app gate sees the fresh session before we navigate.
      await refresh();

      if (rememberMe) {
        localStorage.setItem("cueai-remember-email", String(data.get("email") || ""));
      } else {
        localStorage.removeItem("cueai-remember-email");
      }

      if (destination === "admin") {
        if (!canAccessAdmin(result.session.role)) {
          setError("This account does not have Admin Portal access.");
          setLoading(null);
          router.push(withDesktopParam("/dashboard"));
          return;
        }
        router.push(withDesktopParam("/admin"));
        return;
      }

      const next = searchParams.get("next");
      const dest = next && next.startsWith("/") ? next : "/dashboard";
      router.push(withDesktopParam(dest));
    } catch {
      setError("Unable to reach auth server.");
    } finally {
      setLoading(null);
    }
  }

  if (mac) {
    return (
      <MacAuthShell
        title="Welcome back"
        copy="Sign in to continue to CueAI."
        footer={
          <>
            Don&apos;t have an account?{" "}
            <Link href={mac ? "/signup?desktop=mac" : withDesktopParam("/signup")} className="font-medium text-foreground hover:underline">
              Create your account
            </Link>
          </>
        }
      >
        <MacLoginForm
          error={error}
          loading={loading !== null}
          onSubmit={async ({ email, password }) => {
            setError(null);
            setLoading("user");
            try {
              const result = await loginWithEmailApi({ email, password });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              await refresh();
              const next = searchParams.get("next");
              const dest = next && next.startsWith("/") ? next : "/dashboard";
              router.push(withDesktopParam(dest));
            } catch {
              setError("Unable to reach auth server.");
            } finally {
              setLoading(null);
            }
          }}
        />
        <MacAuthDivider />
        <SocialAuthButtons
          appearance="mac"
          callbackUrl="/dashboard?desktop=mac"
          providers={["google", "apple"]}
        />
      </MacAuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in to your account"
      subtitle="Continue with Google or Apple, or use email."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href={withDesktopParam("/signup")} className="font-medium text-primary hover:underline">
            Create your account
          </Link>
        </>
      }
    >
      <SocialAuthButtons callbackUrl="/dashboard" providers={["google", "apple"]} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-3 text-subtle">or continue with email</span>
        </div>
      </div>

      <form id="login-form" className="space-y-4" onSubmit={onSubmit}>
        <Input
          label="Email"
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
          placeholder={CREDENTIALS_BYPASS ? "Optional while testing" : "••••••••"}
          autoComplete="current-password"
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
        />
        {CREDENTIALS_BYPASS && (
          <p className="text-xs text-subtle">
            Auth is bypassed in this test build — press Sign in to enter the workspace. Type an
            email to reuse a specific test account.
          </p>
        )}
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted">
            <input
              type="checkbox"
              className="rounded border-[var(--border-strong)]"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember me
          </label>
          {!mac && (
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
          )}
        </div>
        {error && (
          <p className="text-sm text-[var(--cue-danger)]" role="alert">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="submit"
            variant="gradient"
            className="w-full"
            size="lg"
            loading={loading === "user"}
            disabled={loading !== null}
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            size="lg"
            loading={loading === "admin"}
            disabled={loading !== null}
            onClick={() => void signIn("admin")}
          >
            <Shield className="h-4 w-4" />
            Admin sign in
          </Button>
        </div>
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
