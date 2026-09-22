/**
 * One-shot purge of E2E / smoke-test pollution from workspace-store.json.
 * Keeps real users, meetings, knowledge, AI config, and settings.
 *
 * Run: node apps/web/scripts/purge-synthetic-store.mjs
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, "..", ".data", "workspace-store.json");

const SYNTHETIC_EMAIL_RE = /@(cueai\.test)$/i;
const SYNTHETIC_LOCAL_PART_RE =
  /^(e2e[_-]|routes-|nav-|features-|rapid-|meet-ctx-|smoke[_-]|revoked_|user\d{6,}|e2e_invite_)/i;
const SYNTHETIC_NAME_RE =
  /^(e2e(\s|$)|test user|e2e tester|e2e user|e2e mgr|e2e qa|remove me|exist user|new admin|new imm|pra invitee|meet qa|smoke user|smoke_mgr)/i;

function isSyntheticEmail(email = "") {
  const e = String(email).trim().toLowerCase();
  if (!e) return false;
  if (SYNTHETIC_EMAIL_RE.test(e)) return true;
  const local = e.split("@")[0] || "";
  if (SYNTHETIC_LOCAL_PART_RE.test(local)) return true;
  if (e.endsWith("@cueai.local") && e !== "admin@cueai.local") {
    if (/^(user\d+|e2e_|plainuser$|member$|ad$|admin$|mgr$|usr$|hey1$)/i.test(local)) {
      return true;
    }
  }
  return false;
}

function isSyntheticName(name = "") {
  return SYNTHETIC_NAME_RE.test(String(name).trim());
}

function isSyntheticUser(u) {
  return isSyntheticEmail(u.email) || isSyntheticName(u.name);
}

function isSyntheticActor(name = "") {
  return isSyntheticName(name) || /^user$/i.test(String(name).trim());
}

const raw = readFileSync(STORE, "utf8");
const store = JSON.parse(raw);
copyFileSync(STORE, `${STORE}.bak-pre-purge`);

const before = {
  users: store.users?.length || 0,
  invites: store.invites?.length || 0,
  usage: store.usage?.length || 0,
  audit: store.audit?.length || 0,
  meetings: store.meetings?.length || 0,
  knowledge: store.knowledge?.length || 0,
};

const keptUsers = (store.users || []).filter((u) => !isSyntheticUser(u));
const keepIds = new Set(keptUsers.map((u) => u.id));

store.users = keptUsers;
store.invites = (store.invites || []).filter((i) => !isSyntheticEmail(i.email));
store.usage = (store.usage || []).filter((u) => {
  if (isSyntheticActor(u.userName)) return false;
  if (u.userId && !keepIds.has(u.userId)) return false;
  return true;
});
store.audit = (store.audit || []).filter((a) => {
  if (isSyntheticActor(a.actorName)) return false;
  if (a.actorId && a.actorId !== "system" && !keepIds.has(a.actorId)) {
    if (isSyntheticName(a.actorName)) return false;
  }
  return true;
});
// Keep real meetings & knowledge as-is.

writeFileSync(STORE, JSON.stringify(store, null, 2), "utf8");

const after = {
  users: store.users.length,
  invites: store.invites.length,
  usage: store.usage.length,
  audit: store.audit.length,
  meetings: store.meetings?.length || 0,
  knowledge: store.knowledge?.length || 0,
};

console.log(
  JSON.stringify(
    {
      ok: true,
      backup: `${STORE}.bak-pre-purge`,
      before,
      after,
      removedUsers: before.users - after.users,
      removedUsage: before.usage - after.usage,
      removedAudit: before.audit - after.audit,
    },
    null,
    2,
  ),
);
