import { describeProfile, type OnboardingProfile } from "@/lib/onboarding";
import { readStore } from "@/lib/server/db";

export async function getOnboardingProfile(
  userId: string | undefined | null,
): Promise<OnboardingProfile | null> {
  if (!userId) return null;
  const store = await readStore();
  return store.users.find((u) => u.id === userId)?.onboarding || null;
}

/** Short "about this user" block for AI prompts; empty string when unknown. */
export async function getProfileContext(userId: string | undefined | null): Promise<string> {
  return describeProfile(await getOnboardingProfile(userId));
}
