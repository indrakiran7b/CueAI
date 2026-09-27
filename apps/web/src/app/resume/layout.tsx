import type { ReactNode } from "react";

/** Pass-through — /resume redirects to /resume-tailor (no CueAI chrome). */
export default function ResumeLegacyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
