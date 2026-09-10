/**
 * Temporary credential bypass for test builds.
 *
 * While the real auth stack is still being built, "Sign in" issues a session
 * without checking a password and "Create my account" always runs the
 * onboarding questionnaire. Sessions, the workspace store and onboarding
 * answers stay real — only the credential check is skipped.
 *
 * Set NEXT_PUBLIC_AUTH_BYPASS=false to require email + password again.
 */
export const CREDENTIALS_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS !== "false";

/** Account used when the sign-in form is submitted with no email. */
export const BYPASS_LOGIN_EMAIL = "tester@cueai.local";

/** Placeholder hash so bypassed accounts still work once auth is enforced. */
export const BYPASS_PASSWORD = "cueai-bypass";
