import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeInternalPath, oauthBridgeCallbackUrl } from "../src/lib/oauth-complete";

test("oauth complete URLs stay on CueAI NextAuth, not Appwrite", () => {
  assert.equal(isSafeInternalPath("/dashboard"), true);
  assert.equal(isSafeInternalPath("/onboarding"), true);
  assert.equal(isSafeInternalPath("https://nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/x"), false);
  assert.equal(isSafeInternalPath("//evil.example"), false);
  assert.equal(isSafeInternalPath("/login"), false);
  assert.equal(oauthBridgeCallbackUrl("/dashboard"), "/auth/complete?next=%2Fdashboard");
  assert.equal(
    oauthBridgeCallbackUrl("https://nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/x"),
    "/auth/complete?next=%2Fdashboard",
  );
});
