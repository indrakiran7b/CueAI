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

    if (status === "loading") return;

    // Server session cookie is source of truth for role.
    void syncSessionFromServer().then(async (s) => {
      if (s) {
        setLocalSession(s);
        setReady(true);
        return;
      }
      // OAuth authenticated but no CueAI cookie yet — link membership by verified email.
      if (nextSession?.user?.email) {
        const linked = await syncOAuthMembership();
        if (linked) {
          setLocalSession(linked);
          setReady(true);
          return;
        }
      }
      setLocalSession(null);
      setReady(true);
    });
  }, [nextSession, status]);

  const logout = useCallback(async () => {
    if (AUTH_BYPASS) {
      localStorage.setItem("cueai-session", JSON.stringify(DEV_GUEST_SESSION));
      setLocalSession({ ...DEV_GUEST_SESSION });
      return;
    }
    await logoutApi();
    clearSession();
    setLocalSession(null);
    if (status === "authenticated") {
      await nextAuthSignOut({ redirect: false });
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
