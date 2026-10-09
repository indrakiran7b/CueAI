import {
  assertAuthBypassNotEnabledInProduction,
  authBypassRequested,
  credentialsBypassRequested,
} from "@/lib/runtime-env";

assertAuthBypassNotEnabledInProduction();

/**
 * Full auth skip for development/test builds only.
 * Enable explicitly: NEXT_PUBLIC_SKIP_AUTH=true
 * Refused at startup when CUEAI_ENV is production.
 */
export const AUTH_BYPASS = authBypassRequested();

/**
 * Credential bypass for automated tests only.
 * Enable explicitly: NEXT_PUBLIC_AUTH_BYPASS=true
 *
 * When off, login/signup require real hashed passwords from the workspace store.
 * Refused at startup when CUEAI_ENV is production.
 */
export const CREDENTIALS_BYPASS = credentialsBypassRequested();

/** Account used when the sign-in form is submitted with no email (bypass mode only). */
export const BYPASS_LOGIN_EMAIL = "tester@cueai.local";

/** Placeholder hash so bypassed accounts still work once auth is enforced. */
export const BYPASS_PASSWORD = "cueai-bypass";
