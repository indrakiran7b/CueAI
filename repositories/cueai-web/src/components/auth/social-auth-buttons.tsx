"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { MacGlassButton } from "@/components/mac";

type ProviderId = "google" | "github" | "apple";
type ProviderStatus = { google: boolean; github: boolean; apple: boolean };

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-.1 2.9-2.3c1.1-1.2 1.5-2.4 1.5-2.5-.1 0-2.8-1.1-2.8-4.1zM14.6 6.3c.6-.8 1.1-1.8.9-2.9-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.8 1.1.1 2.2-.5 2.9-1.3z" />
    </svg>
  );
}

const missingKeyMessage: Record<ProviderId, string> = {
  google: "Google sign-in is not configured. Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET on the server, then restart CueAI.",
  github: "GitHub sign-in is not configured. Add AUTH_GITHUB_ID and AUTH_GITHUB_SECRET on the server, then restart CueAI.",
  apple: "Apple sign-in is not configured. Add AUTH_APPLE_ID and AUTH_APPLE_SECRET on the server, then restart CueAI.",
};

const loadingLabel: Record<ProviderId, string> = {
  google: "Signing in with Google…",
  github: "Signing in with GitHub…",
  apple: "Signing in with Apple…",
};

export function SocialAuthButtons({
  callbackUrl = "/dashboard",
  appearance = "default",
  providers: visibleProviders = ["google", "apple"],
}: {
  callbackUrl?: string;
  appearance?: "default" | "mac";
  providers?: ProviderId[];
}) {
  const [providers, setProviders] = useState<ProviderStatus>({
    google: false,
    github: false,
    apple: false,
  });
  const [loading, setLoading] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data: ProviderStatus) =>
        setProviders({
          google: Boolean(data.google),
          github: Boolean(data.github),
          apple: Boolean(data.apple),
        }),
      )
      .catch(() => setProviders({ google: false, github: false, apple: false }));
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      setLoading(null);
      setError("Sign-in timed out. Try again, or cancel and return to this screen.");
    }, 45000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  async function handleOAuth(provider: ProviderId) {
    setError(null);
    if (!providers[provider]) {
      setError(missingKeyMessage[provider]);
      return;
    }

    setLoading(provider);
    try {
      await signIn(provider, { callbackUrl, redirect: true });
    } catch {
      setError(`Could not start ${provider} sign-in. Check your connection and try again.`);
      setLoading(null);
    }
  }

  const buttons = visibleProviders.map((provider) => {
    const label =
      provider === "google"
        ? "Continue with Google"
        : provider === "apple"
          ? "Continue with Apple"
          : "Continue with GitHub";
    const icon = provider === "google" ? <GoogleIcon /> : provider === "apple" ? <AppleIcon /> : <GitHubIcon />;
    if (appearance === "mac") {
      return (
        <MacGlassButton
          key={provider}
          className="w-full"
          icon={icon}
          loading={loading === provider}
          loadingLabel={loadingLabel[provider]}
          disabled={loading !== null}
          onClick={() => void handleOAuth(provider)}
        >
          {label}
        </MacGlassButton>
      );
    }
    return (
      <Button
        key={provider}
        variant="secondary"
        type="button"
        className="w-full"
        loading={loading === provider}
        disabled={loading !== null}
        onClick={() => void handleOAuth(provider)}
      >
        {icon}
        {loading === provider ? loadingLabel[provider] : label}
      </Button>
    );
  });

  return (
    <div className="space-y-2">
      {appearance === "mac" ? (
        <div className="flex flex-col gap-2">{buttons}</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">{buttons}</div>
      )}
      {error && (
        <p className="text-xs leading-relaxed text-amber-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function MacAuthDivider() {
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-[var(--border)]" />
      </div>
      <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
        <span className="bg-[var(--background-elevated)] px-3 text-subtle">OR</span>
      </div>
    </div>
  );
}
