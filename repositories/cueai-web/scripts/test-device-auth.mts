import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-device-auth-"));
process.env.AUTH_SECRET = "test-device-auth-secret";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";

const {
  generateDeviceCredential,
  hashDeviceCredential,
  resolveDeviceSession,
} = await import("../src/lib/server/devices");
const { updateStore } = await import("../src/lib/server/db");
const { requireAuthOrDevice } = await import("../src/lib/server/api-auth");
const { LIVE_CORS_HEADERS } = await import("../src/lib/server/live-cors");
const {
  canAccessMeeting,
  getLiveBriefing,
  saveLiveBriefing,
} = await import("../src/lib/server/meetings");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const { POST: liveAnswer } = await import("../src/app/api/live/answer/route");
const { GET: briefingGet, PUT: briefingPut, OPTIONS: briefingOptions } = await import(
  "../src/app/api/live/briefing/route"
);
const { POST: meetingEvent } = await import("../src/app/api/live/meeting-event/route");
const { POST: transcribe } = await import("@cueai/transcription-service/routes/transcribe");
const { POST: screenPost, OPTIONS: screenOptions } = await import(
  "@cueai/screen-context-service/routes/screen"
);

const now = new Date().toISOString();
const credentialA = generateDeviceCredential();
const credentialB = generateDeviceCredential();
const missingHashCredential = generateDeviceCredential();

await updateStore((s) => {
  s.workspace.id = "ws_a";
  s.workspace.name = "Workspace A";
  s.users = [
    {
      id: "usr_a",
      name: "User A",
      email: "a@cueai.local",
      passwordHash: "x",
      role: "User",
      status: "Active",
      workspaceId: "ws_a",
      createdAt: now,
    },
    {
      id: "usr_b",
      name: "User B",
      email: "b@cueai.local",
      passwordHash: "x",
      role: "User",
      status: "Active",
      workspaceId: "ws_b",
      createdAt: now,
    },
  ];
  s.devices = [
    {
      id: "dev_active",
      userId: "usr_a",
      deviceId: "device-active-aaaa",
      deviceName: "A Mac",
      platform: "macos",
      appVersion: "1.0.0",
      status: "ACTIVE",
      registeredAt: now,
      credentialHash: hashDeviceCredential(credentialA),
    },
    {
      id: "dev_blocked",
      userId: "usr_a",
      deviceId: "device-blocked-bbbb",
      deviceName: "Blocked",
      platform: "macos",
      appVersion: "1.0.0",
      status: "BLOCKED",
      registeredAt: now,
      credentialHash: hashDeviceCredential(credentialA),
    },
    {
      id: "dev_revoked",
      userId: "usr_a",
      deviceId: "device-revoked-cccc",
      deviceName: "Revoked",
      platform: "macos",
      appVersion: "1.0.0",
      status: "REVOKED",
      registeredAt: now,
      credentialHash: hashDeviceCredential(credentialA),
    },
    {
      id: "dev_nohash",
      userId: "usr_a",
      deviceId: "device-nohash-dddd",
      deviceName: "No hash",
      platform: "macos",
      appVersion: "1.0.0",
      status: "ACTIVE",
      registeredAt: now,
    },
    {
      id: "dev_b",
      userId: "usr_b",
      deviceId: "device-user-b-eeee",
      deviceName: "B Windows",
      platform: "windows",
      appVersion: "1.0.0",
      status: "ACTIVE",
      registeredAt: now,
      credentialHash: hashDeviceCredential(credentialB),
    },
  ];
  s.meetings = [
    {
      id: "mtg_b",
      workspaceId: "ws_b",
      userId: "usr_b",
      title: "B meeting",
      kind: "interview",
      status: "live",
      startedAt: now,
      durationSec: 0,
      attendees: 1,
      tags: ["Interview"],
      transcript: [],
      answers: [],
    },
    {
      id: "mtg_a",
      workspaceId: "ws_a",
      userId: "usr_a",
      title: "A meeting",
      kind: "interview",
      status: "live",
      startedAt: now,
      durationSec: 0,
      attendees: 1,
      tags: ["Interview"],
      transcript: [],
      answers: [],
    },
  ];
  s.activeMeetingId = "mtg_b";
  s.liveBriefing = {
    resumeText: "LEGACY GLOBAL RESUME MUST NOT LEAK",
    updatedAt: now,
  };
});

function deviceRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

test("1. no session + no device credential is unauthorized", async () => {
  assert.equal(await resolveDeviceSession("", ""), null);
  const { error } = await requireAuthOrDevice(deviceRequest("http://local/api/live/answer"));
  assert.ok(error);
  assert.equal(error.status, 401);
});

test("2. invalid device credential is unauthorized", async () => {
  assert.equal(await resolveDeviceSession("device-active-aaaa", "ffffffffffffffff"), null);
});

test("3. missing credentialHash is unauthorized", async () => {
  assert.equal(await resolveDeviceSession("device-nohash-dddd", missingHashCredential), null);
});

test("4. BLOCKED device is unauthorized", async () => {
  assert.equal(await resolveDeviceSession("device-blocked-bbbb", credentialA), null);
});

test("5. REVOKED device is unauthorized", async () => {
  assert.equal(await resolveDeviceSession("device-revoked-cccc", credentialA), null);
});

test("6-8. ACTIVE device derives user and workspace server-side", async () => {
  const session = await resolveDeviceSession("device-active-aaaa", credentialA);
  assert.ok(session);
  assert.equal(session.userId, "usr_a");
  assert.equal(session.email, "a@cueai.local");
  assert.equal(session.workspaceId, "ws_a");
  assert.equal(session.deviceId, "device-active-aaaa");
});

test("9-10. client userId/workspaceId cannot override device identity", async () => {
  const req = deviceRequest("http://local/api/live/briefing", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "X-CueAI-Device-Id": "device-active-aaaa",
      "X-CueAI-Device-Credential": credentialA,
    },
    body: JSON.stringify({
      userId: "usr_b",
      workspaceId: "ws_b",
      resumeText: "User A resume only",
    }),
  });
  const res = await briefingPut(req);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { briefing?: { resumeText?: string } };
  assert.equal(body.briefing?.resumeText, "User A resume only");
  const a = await getLiveBriefing({
    userId: "usr_a",
    email: "a@cueai.local",
    name: "User A",
    role: "User",
    workspaceId: "ws_a",
    workspace: "Workspace A",
    exp: 9999999999,
  });
  const b = await getLiveBriefing({
    userId: "usr_b",
    email: "b@cueai.local",
    name: "User B",
    role: "User",
    workspaceId: "ws_b",
    workspace: "Workspace B",
    exp: 9999999999,
  });
  assert.equal(a?.resumeText, "User A resume only");
  assert.equal(b, null);
});

test("11. user A cannot write user B meeting events", async () => {
  const res = await meetingEvent(
    deviceRequest("http://local/api/live/meeting-event", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-CueAI-Device-Id": "device-active-aaaa",
        "X-CueAI-Device-Credential": credentialA,
      },
      body: JSON.stringify({
        type: "transcript",
        meetingId: "mtg_b",
        who: "You",
        text: "should not write",
        userId: "usr_b",
      }),
    }),
  );
  assert.ok(res.status === 403 || res.status === 404);
});

test("12. user A cannot read user B briefing", async () => {
  await saveLiveBriefing(
    { resumeText: "Secret B resume" },
    {
      userId: "usr_b",
      email: "b@cueai.local",
      name: "User B",
      role: "User",
      workspaceId: "ws_b",
      workspace: "Workspace B",
      exp: 9999999999,
    },
  );
  const res = await briefingGet(
    deviceRequest("http://local/api/live/briefing", {
      headers: {
        "X-CueAI-Device-Id": "device-active-aaaa",
        "X-CueAI-Device-Credential": credentialA,
      },
    }),
  );
  const body = (await res.json()) as { briefing?: { resumeText?: string } | null };
  assert.notEqual(body.briefing?.resumeText, "Secret B resume");
  assert.notEqual(body.briefing?.resumeText, "LEGACY GLOBAL RESUME MUST NOT LEAK");
});

test("13. browser session continues to work", async () => {
  const token = signSession({
    userId: "usr_a",
    email: "a@cueai.local",
    name: "User A",
    role: "User",
    workspaceId: "ws_a",
    workspace: "Workspace A",
  });
  const { error, session } = await requireAuthOrDevice(
    deviceRequest("http://local/api/live/answer", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    }),
  );
  assert.equal(error, null);
  assert.equal(session?.userId, "usr_a");
});

test("14. CORS preflight accepts device headers", async () => {
  const res = await briefingOptions();
  assert.equal(res.status, 204);
  assert.match(
    res.headers.get("Access-Control-Allow-Headers") || "",
    /X-CueAI-Device-Id/i,
  );
  assert.match(
    res.headers.get("Access-Control-Allow-Headers") || "",
    /X-CueAI-Device-Credential/i,
  );
  assert.equal(LIVE_CORS_HEADERS["Access-Control-Allow-Origin"], "*");
  const screen = await screenOptions();
  assert.match(screen.headers.get("Access-Control-Allow-Headers") || "", /X-CueAI-Device-Id/i);
});

test("15. transcription requires authentication", async () => {
  const res = await transcribe(deviceRequest("http://local/api/transcribe", { method: "POST" }));
  assert.equal(res.status, 401);
});

test("16. live answer requires authentication", async () => {
  const res = await liveAnswer(
    deviceRequest("http://local/api/live/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    }),
  );
  assert.equal(res.status, 401);
});

test("17. screen endpoint requires authentication", async () => {
  const res = await screenPost(
    deviceRequest("http://local/api/live/screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,xx" }),
    }),
  );
  assert.equal(res.status, 401);
});

test("18. FastAPI proxy helper keeps a signed session cookie", async () => {
  const { upstreamSessionCookieHeader } = await import("../src/lib/server/api-auth");
  const cookie = upstreamSessionCookieHeader({
    userId: "usr_a",
    email: "a@cueai.local",
    name: "User A",
    role: "User",
    workspaceId: "ws_a",
    workspace: "Workspace A",
    exp: 1,
  });
  assert.match(cookie, new RegExp(`${SESSION_COOKIE}=`));
  assert.ok(!cookie.includes(credentialA));
});

test("meeting access uses canAccessMeeting", () => {
  const sessionA = {
    userId: "usr_a",
    email: "a@cueai.local",
    name: "User A",
    role: "User" as const,
    workspaceId: "ws_a",
    workspace: "A",
    exp: 1,
  };
  assert.equal(
    canAccessMeeting(
      {
        id: "mtg_b",
        workspaceId: "ws_b",
        userId: "usr_b",
        title: "B",
        kind: "interview",
        status: "live",
        startedAt: now,
        durationSec: 0,
        attendees: 1,
        tags: [],
        transcript: [],
        answers: [],
      },
      sessionA,
    ),
    false,
  );
});
