import assert from "node:assert/strict";

function decideOAuthUserLink(opts) {
  const existing = opts.existing;
  if (!existing) return { action: "create" };
  if (existing.status === "Deactivated") return { action: "reject", reason: "deactivated" };
  if (existing.status === "Invited") return { action: "activate_invite" };
  if (!existing.passwordHash) return { action: "sign_in" };
  const session = opts.cueaiSession;
  const sameAccount =
    Boolean(session) &&
    session.userId === existing.id &&
    session.email.trim().toLowerCase() === existing.email.trim().toLowerCase();
  if (sameAccount) return { action: "link_verified_session" };
  return { action: "reject", reason: "OAuthAccountNotLinked" };
}

assert.deepEqual(decideOAuthUserLink({ existing: null }), { action: "create" });
assert.deepEqual(
  decideOAuthUserLink({
    existing: { id: "1", email: "a@x.com", status: "Invited", passwordHash: "" },
  }),
  { action: "activate_invite" },
);
assert.deepEqual(
  decideOAuthUserLink({
    existing: { id: "1", email: "a@x.com", status: "Active", passwordHash: "" },
  }),
  { action: "sign_in" },
);
assert.deepEqual(
  decideOAuthUserLink({
    existing: { id: "1", email: "a@x.com", status: "Active", passwordHash: "salt:hash" },
  }),
  { action: "reject", reason: "OAuthAccountNotLinked" },
);
assert.deepEqual(
  decideOAuthUserLink({
    existing: { id: "1", email: "a@x.com", status: "Active", passwordHash: "salt:hash" },
    cueaiSession: { userId: "1", email: "a@x.com" },
  }),
  { action: "link_verified_session" },
);
assert.deepEqual(
  decideOAuthUserLink({
    existing: { id: "1", email: "a@x.com", status: "Deactivated", passwordHash: "" },
  }),
  { action: "reject", reason: "deactivated" },
);

console.log("oauth-link checks passed");
