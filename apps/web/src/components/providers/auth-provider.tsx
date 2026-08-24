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
  type CueSession,
} from "@/lib/auth";

type AuthContextValue = {
  session: CueSession | null;
  ready: boolean;
  refresh: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function workspaceFromName(name: string) {
  const first = name.trim().split(/\s+/)[0] || "My";
  return `${first}'s Workspace`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: nextSession, status } = useSession();
  const [localSession, setLocalSession] = useState<CueSession | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setLocalSession(getSession());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

    if (nextSession?.user) {
      const name = nextSession.user.name || nextSession.user.email?.split("@")[0] || "User";
      const email = nextSession.user.email || "";
      const oauthSession: CueSession = {
        userId: email || name,
        name,
        email,
        workspace: workspaceFromName(name),
      };
      // Persist so email-local and OAuth share the same app session shape
      localStorage.setItem("cueai-session", JSON.stringify(oauthSession));
      setLocalSession(oauthSession);
      setReady(true);
      return;
    }

    setLocalSession(getSession());
    setReady(true);
  }, [nextSession, status]);

  const logout = useCallback(async () => {
    if (AUTH_BYPASS) {
      // Keep a guest session while auth is bypassed.
      localStorage.setItem("cueai-session", JSON.stringify(DEV_GUEST_SESSION));
      setLocalSession({ ...DEV_GUEST_SESSION });
      return;
    }
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
