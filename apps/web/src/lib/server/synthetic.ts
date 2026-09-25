/**
 * Identifies accounts/events created by automated E2E / smoke tests so they
 * never appear in the user-facing Admin Portal.
 *
 * Legitimate Playwright fixtures live under e2e/ and should use @cueai.test —
 * those must stay in the test suite, not in production workspace data.
 */

const SYNTHETIC_EMAIL_RE =
  /@(cueai\.test)$/i;

const SYNTHETIC_LOCAL_PART_RE =
  /^(e2e[_-]|routes-|nav-|features-|rapid-|meet-ctx-|smoke[_-]|revoked_|user\d{6,}|e2e_invite_)/i;

const SYNTHETIC_NAME_RE =
  /^(e2e(\s|$)|test user|e2e tester|e2e user|e2e mgr|e2e qa|remove me|exist user|new admin|new imm|pra invitee|meet qa|smoke user|smoke_mgr)/i;

export function isSyntheticEmail(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  if (SYNTHETIC_EMAIL_RE.test(e)) return true;
  const local = e.split("@")[0] || "";
  if (SYNTHETIC_LOCAL_PART_RE.test(local)) return true;
  // Historic local-domain E2E accounts (keep bootstrap admin).
  if (e.endsWith("@cueai.local") && e !== "admin@cueai.local") {
    if (
      /^(user\d+|e2e_|plainuser$|member$|ad$|admin$|mgr$|usr$|hey1$)/i.test(local)
    ) {
      return true;
    }
  }
  return false;
}

export function isSyntheticName(name: string | null | undefined): boolean {
  return SYNTHETIC_NAME_RE.test((name || "").trim());
}

export function isSyntheticUser(user: {
  email?: string;
  name?: string;
}): boolean {
  return isSyntheticEmail(user.email) || isSyntheticName(user.name);
}

export function isSyntheticActor(actorName: string | null | undefined): boolean {
  return isSyntheticName(actorName) || /^user$/i.test((actorName || "").trim());
}
