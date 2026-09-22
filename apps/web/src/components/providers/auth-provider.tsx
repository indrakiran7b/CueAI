"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSession, signOut as nextAuthSignOut } from "next-auth/react";
import {
  clearSession,
  getSession,
  AUTH_BYPASS,
  DEV_GUEST_SESSION,
  logoutApi,
  syncOAuthMembership,
  syncSessionFromServer,
  type CueSession,
} from "@/lib/auth";

type AuthContextValue = {
  session: CueSession | null;
  ready: boolean;
  /** Re-reads live membership from the server; await it before navigating on it. */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: nextSession, status } = useSession();
  const [localSession, setLocalSession] = useState<CueSession | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    // Always prefer live server membership/role over stale localStorage/JWT claims.
    const next = await syncSessionFromServer();
    setLocalSession(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) {
      const guest = getSession() || DEV_GUEST_SESSION;
      if (typeof window !== "undefined") {
        localStorage.setItem("cueai-session", JSON.stringify(guest));
      }
      setLocalSession(guest);
      setReady(true);
      return;
    }

    console.log("[AUTH] Startup");
    if (status === "loading") {
      console.log("[AUTH] Session check started");
      return;
    }

    // Server session cookie is source of truth for role.
    console.log("[AUTH] Session check started");
    void syncSessionFromServer().then(async (s) => {
      if (s) {
        setLocalSession(s);
        setReady(true);
        console.log("[AUTH] Session check complete");
        return;
      }
      // OAuth authenticated but no CueAI cookie yet — link membership by verified email.
      if (nextSession?.user?.email) {
        const linked = await syncOAuthMembership();
        if (linked) {
          setLocalSession(linked);
          setReady(true);
          console.log("[AUTH] Session check complete");
          return;
        }
      }
      setLocalSession(null);
      setReady(true);
      console.log("[AUTH] Session check complete");
    });
  }, [nextSession?.user?.email, status]);

  const logout = useCallback(async () => {
    if (AUTH_BYPASS) {
      localStorage.setItem("cueai-session", JSON.stringify(DEV_GUEST_SESSION));
      setLocalSession({ ...DEV_GUEST_SESSION });
      return;
    }
    try {
      // Stop any active companion / capture when leaving the app.
      const { startDesktopMeetingSession, hideCompanionOverlay } = await import(
        "@/lib/desktop"
      );
      await startDesktopMeetingSession({
        active: false,
        screenSharing: false,
        cueAiMode: "inactive",
        hideCompanion: true,
      });
      await hideCompanionOverlay();
    } catch {
      // Desktop may not be running.
    }
    await logoutApi();
    clearSession();
    setLocalSession(null);
    if (status === "authenticated") {
      await nextAuthSignOut({ redirect: false });
    }
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }, [status]);

  return (
    <AuthContext.Provider value={{ session: localSession, ready, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
