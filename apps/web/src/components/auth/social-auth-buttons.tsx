"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

type ProviderStatus = { google: boolean; github: boolean };

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 7.3l3 2.2C7.7 7.5 9.7 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 8.5 2.7 5.5 4.7 3.9 7.3z"
      />
      <path
        fill="#4A90E2"
        d="M12 21.3c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8l-3 2.3c1.6 3.1 4.8 4.9 8.1 4.9z"
      />
      <path
        fill="#FBBC05"
        d="M6.9 14.1c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9l-3-2.3C3.3 9.4 3 10.6 3 12.2c0 1.6.3 2.8.9 4l3-2.1z"
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

/**
 * `onBypass` replaces the OAuth redirect while credentials are stubbed, so the
 * provider buttons behave like the email form instead of erroring on missing keys.
 */
export function SocialAuthButtons({
  callbackUrl = "/dashboard",
  onBypass,
}: {
  callbackUrl?: string;
  onBypass?: () => void | Promise<void>;
}) {
  const [providers, setProviders] = useState<ProviderStatus>({ google: false, github: false });
  const [loading, setLoading] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (onBypass) return;
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data: ProviderStatus) => setProviders(data))
      .catch(() => setProviders({ google: false, github: false }));
  }, [onBypass]);

  async function handleOAuth(provider: "google" | "github") {
    setError(null);

    if (onBypass) {
      setLoading(provider);
      await onBypass();
      setLoading(null);
      return;
    }

    if (!providers[provider]) {
      setError(
        provider === "google"
          ? "Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to .env.local, then restart the server."
          : "Add AUTH_GITHUB_ID and AUTH_GITHUB_SECRET to .env.local, then restart the server."
      );
      return;
    }

    setLoading(provider);
    try {
      await signIn(provider, { callbackUrl });
    } catch {
      setError(`Could not start ${provider} sign-in. Check your OAuth credentials.`);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="secondary"
          type="button"
          className="w-full"
          loading={loading === "google"}
          disabled={loading !== null}
          onClick={() => handleOAuth("google")}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        <Button
          variant="secondary"
          type="button"
          className="w-full"
          loading={loading === "github"}
          disabled={loading !== null}
          onClick={() => handleOAuth("github")}
        >
          <GitHubIcon />
          Continue with GitHub
        </Button>
      </div>
      {error && (
        <p className="text-xs leading-relaxed text-amber-400" role="alert">
          {error}
        </p>
      )}
      {!onBypass && !providers.google && !providers.github && (
        <p className="text-xs text-subtle">
          OAuth keys are empty in <code className="text-muted">.env.local</code>. Add Google /
          GitHub client IDs to enable these buttons. See README.
        </p>
      )}
    </div>
  );
}
