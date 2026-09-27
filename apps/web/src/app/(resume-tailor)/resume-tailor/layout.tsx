"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RequireResumeAccess } from "@/components/auth/require-resume-access";
import { ResumeTailorShell } from "@/components/resume/resume-tailor-shell";
import { isResumePublicPath } from "@/lib/product-mode";

export default function ResumeTailorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isResumePublicPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <RequireResumeAccess>
      <ResumeTailorShell>{children}</ResumeTailorShell>
    </RequireResumeAccess>
  );
}
