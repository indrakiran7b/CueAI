import { randomUUID } from "node:crypto";
import { BYPASS_LOGIN_EMAIL, BYPASS_PASSWORD } from "@/lib/auth-mode";
import { appendAudit, updateStore, type DbUser } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/session";

function nameFromEmail(email: string) {
  const local = email.split("@")[0] || "Tester";
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(" ") || "Tester";
}

/** Throwaway address so every bypassed signup gets a fresh questionnaire. */
export function generateBypassSignupEmail() {
  return `tester-${randomUUID().slice(0, 6)}@cueai.local`;
}

/**
 * Resolve the account a bypassed sign-in lands on, creating it if needed.
 *
 * `completeOnboarding` decides where the app gate sends the user afterwards:
 * sign-in marks onboarding done so it goes straight to the dashboard, while
 * sign-up leaves it unanswered so the questionnaire runs.
 */
export async function resolveBypassUser(input: {
  email?: string;
  name?: string;
  completeOnboarding: boolean;
}): Promise<{ user: DbUser; workspace: string; workspaceId: string }> {
  const email = input.email?.trim().toLowerCase() || BYPASS_LOGIN_EMAIL;
  const name = input.name?.trim();
  const now = new Date().toISOString();
  let userId = "";

  const store = await updateStore(async (s) => {
    let user = s.users.find((u) => u.email === email);

    if (!user) {
      user = {
        id: `usr_${randomUUID().slice(0, 10)}`,
        name: name || nameFromEmail(email),
        email,
        passwordHash: hashPassword(BYPASS_PASSWORD),
        // Test accounts need the admin portal reachable without an invite flow.
        role: "Admin",
        status: "Active",
        workspaceId: s.workspace.id,
        createdAt: now,
      };
      s.users.push(user);
      await appendAudit(s, {
        actorId: user.id,
        actorName: user.name,
        action: "user.signed_up",
        resourceType: "user",
        resourceId: user.id,
        metadata: { role: user.role, bypass: true },
        workspaceId: user.workspaceId,
      });
    }

    // Never dead-end a bypassed sign-in on an invited or deactivated account.
    user.status = "Active";
    if (!user.passwordHash) user.passwordHash = hashPassword(BYPASS_PASSWORD);
    if (name) user.name = name;
    user.lastActiveAt = now;

    if (input.completeOnboarding && !user.onboarding?.completedAt) {
      user.onboarding = {
        ...(user.onboarding || {}),
        completedAt: now,
        skipped: true,
        updatedAt: now,
      };
    }

    userId = user.id;
  });

  const user = store.users.find((u) => u.id === userId)!;
  return {
    user,
    workspace: store.workspace.name,
    workspaceId: user.workspaceId || store.workspace.id,
  };
}
