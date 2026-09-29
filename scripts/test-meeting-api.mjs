import { writeFileSync } from "node:fs";

const origin = process.argv[2] || "http://127.0.0.1:3001";
const email = process.argv[3] || "free@cueai.local";
const password = process.argv[4] || "user123";
const meetingId = process.argv[5] || "mtg_qa_limit_test";

async function login() {
  const res = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, cookie, body };
}

const auth = await login();
if (!auth.ok) {
  console.error("LOGIN_FAIL", auth.status, auth.body);
  process.exit(1);
}

const meetingRes = await fetch(`${origin}/api/meetings/${meetingId}`, {
  headers: { Cookie: auth.cookie },
});
const meetingBody = await meetingRes.json();
const answers = meetingBody.meeting?.answers || meetingBody.meeting?.aiAnswers || [];
const result = {
  origin,
  email,
  role: auth.body.user?.role,
  plan: auth.body.user?.plan,
  status: meetingRes.status,
  answersLength: answers.length,
  hasMore: meetingBody.meeting?.hasMore,
  fullSummaryAvailable: meetingBody.meeting?.fullSummaryAvailable,
  firstPrompt: answers[0]?.prompt,
  lastPrompt: answers[answers.length - 1]?.prompt,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync("scripts/.last-meeting-api-test.json", JSON.stringify(result, null, 2));
