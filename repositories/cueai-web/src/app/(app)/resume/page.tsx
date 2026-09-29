"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResumeAliasPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/resume-tailor");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
      Opening Resume Tailor…
    </div>
  );
}
