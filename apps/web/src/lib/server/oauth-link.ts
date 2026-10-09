/**
 * Decide how a verified OAuth identity maps onto a CueAI user.
 *
 * Verified-email policy:
 * - Invited memberships may activate (invite was sent to that address).
 * - OAuth-only accounts (no password) may sign in again.
 * - Password accounts are not linked just because the email matches.
 *   Linking is allowed only when the user is already signed in to that
 *   same CueAI account (sign in with email first).
 */

export type OAuthExistingUser = {
  id: string;
  email: string;
  status: string;
  passwordHash: string;
};

export type OAuthLinkDecision =
  | { action: "create" }
  | { action: "activate_invite" }
  | { action: "sign_in" }
  | { action: "link_verified_session" }
  | { action: "reject"; reason: "OAuthAccountNotLinked" | "deactivated" };

export function decideOAuthUserLink(opts: {
  existing?: OAuthExistingUser | null;
  cueaiSession?: { userId: string; email: string } | null;
}): OAuthLinkDecision {
  const existing = opts.existing;
  if (!existing) return { action: "create" };
  if (existing.status === "Deactivated") return { action: "reject", reason: "deactivated" };
  if (existing.status === "Invited") return { action: "activate_invite" };
  if (!existing.passwordHash) return { action: "sign_in" };

  const session = opts.cueaiSession;
  const sameAccount =
    Boolean(session) &&
    session!.userId === existing.id &&
    session!.email.trim().toLowerCase() === existing.email.trim().toLowerCase();
  if (sameAccount) return { action: "link_verified_session" };

  return { action: "reject", reason: "OAuthAccountNotLinked" };
}
