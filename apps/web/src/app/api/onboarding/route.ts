import { NextResponse } from "next/server";
import {
  isOnboardingAnswered,
  sanitizeOnboardingAnswers,
  type OnboardingProfile,
} from "@/lib/onboarding";
import { requireAuth } from "@/lib/server/api-auth";
import { appendAudit, readStore, updateStore } from "@/lib/server/db";

/** Current user's questionnaire answers, so the wizard can prefill on re-entry. */
export async function GET() {
  const { error, session } = await requireAuth();
  if (error || !session) return error || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = await readStore();
  const profile = store.users.find((u) => u.id === session.userId)?.onboarding || null;

  return NextResponse.json({
    completed: Boolean(profile?.completedAt),
    skipped: Boolean(profile?.skipped),
    answers: profile || {},
  });
}

/** Save answers. `skipped: true` marks onboarding done without requiring answers. */
export async function PUT(req: Request) {
  const { error, session } = await requireAuth();
  if (error || !session) return error || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { answers?: unknown; skipped?: boolean }
    | null;
  const skipped = body?.skipped === true;
  const answers = sanitizeOnboardingAnswers(body?.answers);

  if (!skipped && !isOnboardingAnswered(answers)) {
    return NextResponse.json(
      { error: "Please answer the required questions before continuing." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  let saved: OnboardingProfile = { ...answers, completedAt: now, skipped, updatedAt: now };

  await updateStore(async (s) => {
    const user = s.users.find((u) => u.id === session.userId);
    if (!user) return;

    const firstTime = !user.onboarding?.completedAt;
    saved = {
      ...answers,
      // Keep the original completion timestamp when the user edits answers later.
      completedAt: user.onboarding?.completedAt || now,
      skipped,
      updatedAt: now,
    };
    user.onboarding = saved;

    await appendAudit(s, {
      actorId: user.id,
      actorName: user.name,
      action: firstTime ? "user.onboarding_completed" : "user.onboarding_updated",
      resourceType: "user",
      resourceId: user.id,
      metadata: {
        skipped,
        persona: answers.persona || null,
        goals: answers.goals?.join(",") || null,
      },
      workspaceId: user.workspaceId,
    });
  });

  return NextResponse.json({ completed: true, skipped, answers: saved });
}
