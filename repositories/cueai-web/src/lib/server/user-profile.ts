import { describeProfile, type OnboardingProfile } from "@/lib/onboarding";
import { describeProfessionalProfile, type ProfessionalProfile } from "@/lib/professional-profile";
import { readStore } from "@/lib/server/db";

export async function getOnboardingProfile(
  userId: string | undefined | null,
): Promise<OnboardingProfile | null> {
  if (!userId) return null;
  const store = await readStore();
  return store.users.find((u) => u.id === userId)?.onboarding || null;
}

export async function getProfessionalProfile(
  userId: string | undefined | null,
): Promise<ProfessionalProfile | null> {
  if (!userId) return null;
  const store = await readStore();
  return store.users.find((u) => u.id === userId)?.professionalProfile || null;
}

/**
 * Short "about this user" block for AI prompts; empty string when unknown.
 * "brief" (default) keeps only role, level, domain and skills; "full" adds the
 * self-reported work history from Settings → Profile.
 */
export async function getProfileContext(
  userId: string | undefined | null,
  detail: "brief" | "full" = "brief",
): Promise<string> {
  if (!userId) return "";
  const store = await readStore();
  const user = store.users.find((u) => u.id === userId);
  return [describeProfile(user?.onboarding), describeProfessionalProfile(user?.professionalProfile, detail)]
    .filter(Boolean)
    .join("\n");
}
