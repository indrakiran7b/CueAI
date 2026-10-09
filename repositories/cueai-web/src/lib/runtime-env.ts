/**
 * Shared CueAI environment policy (Edge + Node).
 * CUEAI_ENV is the product environment. NODE_ENV=production in Docker images
 * does not by itself mean a production deployment.
 */

const KNOWN_AUTH_SECRET_PLACEHOLDERS = new Set([
  "",
  "<change-me>",
  "change-me",
  "changeme",
  "cueai-dev-secret-change-me",
]);

/** Explicit development-only signing fallback. Never used when CUEAI_ENV is production. */
export const DEV_AUTH_SECRET_FALLBACK = "cueai-dev-secret-change-me";

export function envFlag(value?: string | null): boolean {
  const v = (value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isCueaiProduction(): boolean {
  const env = (process.env.CUEAI_ENV || "").trim().toLowerCase();
  return env === "production" || env === "prod";
}

export function isAuthSecretPlaceholder(value?: string | null): boolean {
  const raw = (value || "").trim();
  if (!raw) return true;
  return KNOWN_AUTH_SECRET_PLACEHOLDERS.has(raw.toLowerCase()) || raw === "<change-me>";
}

export function configuredAuthSecret(): string {
  return (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
}

/**
 * Production: missing/placeholder AUTH_SECRET is a configuration error.
 * Development/test: placeholder or unset may use the explicit local fallback.
 */
export function resolveAuthSecret(): string {
  const raw = configuredAuthSecret();
  if (isCueaiProduction()) {
    if (isAuthSecretPlaceholder(raw)) {
      throw new Error(
        "AUTH_SECRET is required in production and must not be a known placeholder.",
      );
    }
    return raw;
  }
  if (isAuthSecretPlaceholder(raw)) {
    return DEV_AUTH_SECRET_FALLBACK;
  }
  return raw;
}

export function authBypassRequested(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_SKIP_AUTH) || envFlag(process.env.CUEAI_SKIP_AUTH);
}

export function credentialsBypassRequested(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_AUTH_BYPASS);
}

export function assertAuthBypassNotEnabledInProduction(): void {
  if (!isCueaiProduction()) return;
  if (authBypassRequested() || credentialsBypassRequested()) {
    throw new Error(
      "NEXT_PUBLIC_SKIP_AUTH / NEXT_PUBLIC_AUTH_BYPASS cannot be enabled when CUEAI_ENV is production.",
    );
  }
}
