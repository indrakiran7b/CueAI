/**
 * Seed a free USER, a premium USER, and a completed meeting with 8 Q&A.
 * Does not change AUTH_BYPASS. Run: node scripts/seed-meeting-qa-test.mjs
 */
import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function seedStore(storePath) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  let store;
  if (fs.existsSync(storePath)) {
    store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } else {
    store = {
      workspace: { id: "ws_default", name: "CueAI Workspace", seats: 25 },
      users: [],
      invites: [],
      knowledge: [],
      usage: [],
      audit: [],
      meetings: [],
      ai: { provider: "groq", model: "openai/gpt-oss-20b" },
    };
  }
  store.users = Array.isArray(store.users) ? store.users : [];
  store.meetings = Array.isArray(store.meetings) ? store.meetings : [];

  const now = new Date().toISOString();
  const passwordHash = hashPassword("user123");
  const adminHash = hashPassword("admin123");

  function upsertUser(id, email, name, role, plan, hash = passwordHash) {
    const existing = store.users.find((u) => u.email === email || u.id === id);
    if (existing) {
      existing.role = role;
      existing.plan = plan;
      existing.status = "Active";
      existing.passwordHash = hash;
      existing.onboarding = {
        completedAt: now,
        skipped: true,
        updatedAt: now,
      };
      return existing;
    }
    const user = {
      id,
      name,
      email,
      passwordHash: hash,
      role,
      plan,
      status: "Active",
      workspaceId: store.workspace.id || "ws_default",
      createdAt: now,
      lastActiveAt: now,
      onboarding: { completedAt: now, skipped: true, updatedAt: now },
    };
    store.users.push(user);
    return user;
  }

  upsertUser(
    "usr_bootstrap_admin",
    "admin@cueai.local",
    "Workspace Admin",
    "Admin",
    "free",
    adminHash,
  );
  const freeUser = upsertUser("usr_free_qa", "free@cueai.local", "Free User", "User", "free");
  const premiumUser = upsertUser(
    "usr_premium_qa",
    "premium@cueai.local",
    "Premium User",
    "User",
    "premium",
  );

  const answers = Array.from({ length: 8 }, (_, i) => ({
    prompt: `Question ${i + 1} about the roadmap?`,
    answer: `Answer ${i + 1}: this is a stored meeting answer.`,
    at: now,
  }));

  function upsertMeeting(id, userId, title) {
    store.meetings = store.meetings.filter((m) => m.id !== id);
    store.meetings.push({
      id,
      workspaceId: store.workspace.id || "ws_default",
      userId,
      title,
      kind: "regular",
      status: "completed",
      startedAt: now,
      endedAt: now,
      durationSec: 1200,
      attendees: 3,
      tags: ["test"],
      description: "Seeded meeting with eight answers for entitlement clipping.",
      transcript: [],
      answers,
      summary: "Overview of the entitlement test meeting covering eight questions.",
    });
  }

  upsertMeeting("mtg_qa_limit_test", freeUser.id, "Q&A entitlement test meeting");
  upsertMeeting(
    "mtg_qa_limit_premium",
    premiumUser.id,
    "Q&A premium entitlement test meeting",
  );

  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log("Seeded", storePath);
}

seedStore(path.join("apps", "web", ".data", "workspace-store.json"));
seedStore(path.join("repositories", "cueai-web", ".data", "workspace-store.json"));
