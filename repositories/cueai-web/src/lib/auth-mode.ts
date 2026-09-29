/**
 * Full auth skip for test builds only.
 * Enable explicitly: NEXT_PUBLIC_SKIP_AUTH=true
 */
export const AUTH_BYPASS =
  process.env.NEXT_PUBLIC_SKIP_AUTH === "true" ||
  process.env.NEXT_PUBLIC_SKIP_AUTH === "1";

/**
 * Credential bypass for automated tests only.
 * Enable explicitly: NEXT_PUBLIC_AUTH_BYPASS=true
 *
 * When off, login/signup require real hashed passwords from the workspace store.
 */
export const CREDENTIALS_BYPASS =
  process.env.NEXT_PUBLIC_AUTH_BYPASS === "true" ||
  process.env.NEXT_PUBLIC_AUTH_BYPASS === "1";

/** Account used when the sign-in form is submitted with no email (bypass mode only). */
export const BYPASS_LOGIN_EMAIL = "tester@cueai.local";

/** Placeholder hash so bypassed accounts still work once auth is enforced. */
export const BYPASS_PASSWORD = "cueai-bypass";
