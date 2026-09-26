import { redirect } from "next/navigation";

/**
 * Public Resume Tailor entry alias.
 * Canonical experience lives at /resume (isolated product shell).
 */
export default function ResumeTailorAliasPage() {
  redirect("/resume");
}
