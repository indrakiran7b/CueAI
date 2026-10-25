"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";

/** Loads the signed-in user's saved palette whenever the account changes; signing out shows the default. */
export function PaletteSync() {
  const { session, ready } = useAuth();
  const { syncPaletteForUser } = useTheme();
  const userId = session?.userId ?? null;

  useEffect(() => {
    if (!ready) return;
    void syncPaletteForUser(userId);
  }, [ready, userId, syncPaletteForUser]);

  return null;
}
