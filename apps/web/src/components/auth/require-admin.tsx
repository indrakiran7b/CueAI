"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { can, type AdminPermission, canAccessAdmin } from "@/lib/roles";

export function RequireAdmin({
  children,
  permission,
  fallbackHref = "/dashboard",
}: {
  children: ReactNode;
  permission?: AdminPermission;
  fallbackHref?: string;
}) {
  const { session, ready, refresh } = useAuth();
  const router = useRouter();

  // Force live role from server before deciding access (avoids stale localStorage User).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const role = session?.role;
  const allowed = permission ? can(role, permission) : canAccessAdmin(role);

  useEffect(() => {
    if (!ready) return;
    if (!session || !allowed) {
      router.replace(fallbackHref);
    }
  }, [ready, session, allowed, router, fallbackHref]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Checking permissions…
      </div>
    );
  }

  if (!session || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
