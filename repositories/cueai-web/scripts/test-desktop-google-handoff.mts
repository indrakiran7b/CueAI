import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createHash, randomBytes } from "node:crypto";

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-desktop-oauth-"));
process.env.AUTH_GOOGLE_ID = "332159317387-testdesktopclient.apps.googleusercontent.com";
process.env.AUTH_GOOGLE_SECRET = "GOCSPX-testdesktopsecret";

const {
  beginDesktopGoogleHandoff,
  exchangeDesktopGoogleHandoff,
  finishDesktopGoogleHandoff,
  getDesktopGoogleTicketStatus,
  hashDesktopVerifier,
  parseSafeLoopbackOrigin,
} = await import("../src/lib/server/desktop-google-handoff");

function challengeFor(verifier: string) {
  return createHash("sha256").update(verifier, "utf8").digest("hex");
}

test("desktop Google handoff is single-use and bound to device + verifier", async () => {
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("hex");
  const deviceId = "11111111-2222-3333-4444-555555555555";

  const begin = await beginDesktopGoogleHandoff({
    deviceId,
    platform: "windows",
    state,
    challenge: challengeFor(verifier),
  });
  assert.equal(begin.ok, true);
  if (begin.ok) {
    assert.match(begin.browserPath, /\/auth\/desktop\/google\?state=/);
  }

  const tooEarly = await exchangeDesktopGoogleHandoff({
    state,
    code: "deadbeef",
    verifier,
    deviceId,
  });
  assert.equal(tooEarly.ok, false);
  if (!tooEarly.ok) assert.equal(tooEarly.code, "not_ready");

  const finished = await finishDesktopGoogleHandoff({ state, userId: "usr_desktop" });
  assert.equal(finished.ok, true);
  if (!finished.ok) throw new Error("finish failed");
  assert.match(finished.deeplink, /^cueai:\/\/auth\/callback\?/);
  const url = new URL(finished.deeplink);
  const code = url.searchParams.get("code") || "";
  assert.ok(code.length >= 32);

  const wrongVerifier = await exchangeDesktopGoogleHandoff({
    state,
    code,
    verifier: randomBytes(32).toString("hex"),
    deviceId,
  });
  assert.equal(wrongVerifier.ok, false);

  const exchanged = await exchangeDesktopGoogleHandoff({
    state,
    code,
    verifier,
    deviceId,
  });
  assert.equal(exchanged.ok, true);
  if (exchanged.ok) {
    assert.equal(exchanged.userId, "usr_desktop");
    assert.equal(exchanged.platform, "windows");
  }

  const reused = await exchangeDesktopGoogleHandoff({
    state,
    code,
    verifier,
    deviceId,
  });
  assert.equal(reused.ok, false);
  if (!reused.ok) assert.equal(reused.code, "consumed");
});

test("desktop Google handoff hashes match the desktop verifier helper", () => {
  const verifier = "abc123";
  assert.equal(hashDesktopVerifier(verifier), challengeFor(verifier));
});

test("loopback origins must be http://127.0.0.1 on an unprivileged port", () => {
  assert.equal(parseSafeLoopbackOrigin("http://127.0.0.1:49152"), "http://127.0.0.1:49152");
  assert.equal(parseSafeLoopbackOrigin("http://localhost:49152"), null);
  assert.equal(parseSafeLoopbackOrigin("https://127.0.0.1:49152"), null);
  assert.equal(parseSafeLoopbackOrigin("http://evil.example:49152"), null);
  assert.equal(parseSafeLoopbackOrigin("http://127.0.0.1:80"), null);
});

test("desktop Google exchange can complete from poll after finish without the deeplink code", async () => {
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("hex");
  const deviceId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  const begin = await beginDesktopGoogleHandoff({
    deviceId,
    platform: "macos",
    state,
    challenge: challengeFor(verifier),
    loopbackOrigin: "http://127.0.0.1:49152",
  });
  assert.equal(begin.ok, true);

  const before = await getDesktopGoogleTicketStatus(state);
  assert.equal(before.ok, true);
  if (before.ok) assert.equal(before.ready, false);

  const finished = await finishDesktopGoogleHandoff({ state, userId: "usr_poll" });
  assert.equal(finished.ok, true);
  if (finished.ok) {
    assert.match(finished.loopbackUrl || "", /^http:\/\/127\.0\.0\.1:49152\/callback\?/);
  }

  const ready = await getDesktopGoogleTicketStatus(state);
  assert.equal(ready.ok, true);
  if (ready.ok) assert.equal(ready.ready, true);

  const exchanged = await exchangeDesktopGoogleHandoff({
    state,
    code: "",
    verifier,
    deviceId,
  });
  assert.equal(exchanged.ok, true);
  if (exchanged.ok) assert.equal(exchanged.userId, "usr_poll");

  const replay = await exchangeDesktopGoogleHandoff({
    state,
    code: "",
    verifier,
    deviceId,
  });
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.code, "consumed");
});

test("finish can claim the unique open desktop ticket after a web dashboard login", async () => {
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("hex");
  const deviceId = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";

  const begin = await beginDesktopGoogleHandoff({
    deviceId,
    platform: "windows",
    state,
    challenge: challengeFor(verifier),
  });
  assert.equal(begin.ok, true);

  const claimed = await finishDesktopGoogleHandoff({ state: "", userId: "usr_rescue" });
  assert.equal(claimed.ok, true);

  const exchanged = await exchangeDesktopGoogleHandoff({
    state,
    code: "",
    verifier,
    deviceId,
  });
  assert.equal(exchanged.ok, true);
  if (exchanged.ok) assert.equal(exchanged.userId, "usr_rescue");
});

test("desktop Google begin rejects an untrusted loopback origin", async () => {
  const result = await beginDesktopGoogleHandoff({
    deviceId: "11111111-2222-3333-4444-555555555555",
    platform: "windows",
    state: randomBytes(24).toString("hex"),
    challenge: challengeFor(randomBytes(32).toString("hex")),
    loopbackOrigin: "http://evil.example:49152",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_loopback");
});
