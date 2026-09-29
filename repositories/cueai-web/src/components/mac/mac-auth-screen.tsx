"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { MacGlassButton, MacGlassInput, MacGlassPanel } from "@/components/mac";

export function MacAuthShell({
  title,
  copy,
  children,
  footer,
}: {
  title: string;
  copy: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mac-auth-shell" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
      <MacGlassPanel>
        <p className="mac-auth-kicker">CueAI</p>
        <h1 className="mac-auth-title">{title}</h1>
        <p className="mac-auth-copy">{copy}</p>
        {children}
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </MacGlassPanel>
    </div>
  );
}

export function MacLoginForm({
  error,
  loading,
  onSubmit,
}: {
  error: string | null;
  loading: boolean;
  onSubmit: (fields: { email: string; password: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit() {
    if (loading) return;
    await onSubmit({ email, password });
  }

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    await submit();
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void handle(e)}>
      <label className="block text-xs font-medium text-muted" htmlFor="mac-login-email">
        Email
      </label>
      <MacGlassInput
        id="mac-login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="block text-xs font-medium text-muted" htmlFor="mac-login-password">
        Password
      </label>
      <MacGlassInput
        id="mac-login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p className="text-sm text-[var(--cue-danger)]" role="alert">
          {error}
        </p>
      )}
      <MacGlassButton
        accent
        className="mt-2 w-full"
        loading={loading}
        loadingLabel="Signing in…"
        type="submit"
        onClick={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        Sign In
      </MacGlassButton>
      <p className="pt-1 text-right text-xs">
        <Link href="/forgot-password?desktop=mac" className="text-muted hover:text-foreground hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

export function MacSignupForm({
  error,
  loading,
  onSubmit,
}: {
  error: string | null;
  loading: boolean;
  onSubmit: (fields: { name: string; email: string; password: string }) => Promise<void>;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    setLocalError(null);
  }, [error]);

  async function submit() {
    if (loading) return;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail || !password) {
      setLocalError("Name, email, and password are required.");
      return;
    }
    if (!trimmedEmail.includes("@")) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    setLocalError(null);
    await onSubmit({ name: trimmedName, email: trimmedEmail, password });
  }

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    await submit();
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void handle(e)}>
      <label className="block text-xs font-medium text-muted" htmlFor="mac-signup-name">
        Name
      </label>
      <MacGlassInput
        id="mac-signup-name"
        name="name"
        autoComplete="name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="block text-xs font-medium text-muted" htmlFor="mac-signup-email">
        Email
      </label>
      <MacGlassInput
        id="mac-signup-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="block text-xs font-medium text-muted" htmlFor="mac-signup-password">
        Password
      </label>
      <MacGlassInput
        id="mac-signup-password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label className="block text-xs font-medium text-muted" htmlFor="mac-signup-confirm">
        Confirm Password
      </label>
      <MacGlassInput
        id="mac-signup-confirm"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {(localError || error) && (
        <p className="text-sm text-[var(--cue-danger)]" role="alert">
          {localError || error}
        </p>
      )}
      <MacGlassButton
        accent
        className="mt-2 w-full"
        loading={loading}
        loadingLabel="Creating account…"
        type="submit"
        onClick={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        Create Account
      </MacGlassButton>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login?desktop=mac" className="text-foreground underline-offset-2 hover:underline">
          Sign In
        </Link>
      </p>
    </form>
  );
}
