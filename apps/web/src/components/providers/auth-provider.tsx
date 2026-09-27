"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  refresh: () => Promise<CueSession | null>;
  /** Apply a known session immediately (e.g. after login) and invalidate in-flight syncs. */
  applySession: (session: CueSession | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: nextSession, status } = useSession();
  const [localSession, setLocalSession] = useState<CueSession | null>(null);
  const [ready, setReady] = useState(false);
  /** Bumped on every apply/refresh so stale /api/auth/me responses cannot wipe a fresh login. */
  const syncGenRef = useRef(0);

  const applySession = useCallback((session: CueSession | null) => {
    syncGenRef.current += 1;
    setLocalSession(session);
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    const gen = ++syncGenRef.current;
    const next = await syncSessionFromServer();
    if (gen !== syncGenRef.current) return next;
    setLocalSession(next);
    setReady(true);
    return next;
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) {
      const guest = getSession() || DEV_GUEST_SESSION;
      if (typeof window !== "undefined") {
        localStorage.setItem("cueai-session", JSON.stringify(guest));
      }
      applySession(guest);
      return;
    }

    if (status === "loading") return;

    let cancelled = false;
    const gen = ++syncGenRef.current;

    void (async () => {
      const s = await syncSessionFromServer();
      if (cancelled || gen !== syncGenRef.current) return;

      if (s) {
        setLocalSession(s);
        setReady(true);
        return;
      }

      // OAuth authenticated but no CueAI cookie yet — link membership by verified email.
      if (nextSession?.user?.email) {
        const linked = await syncOAuthMembership();
        if (cancelled || gen !== syncGenRef.current) return;
        if (linked) {
          setLocalSession(linked);
          setReady(true);
          return;
        }
      }

      if (cancelled || gen !== syncGenRef.current) return;
      setLocalSession(null);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [nextSession?.user?.email, status, applySession]);

  const logout = useCallback(async () => {
    if (AUTH_BYPASS) {
      localStorage.setItem("cueai-session", JSON.stringify(DEV_GUEST_SESSION));
      applySession({ ...DEV_GUEST_SESSION });
      return;
    }
    try {
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
    applySession(null);
    if (status === "authenticated") {
      await nextAuthSignOut({ redirect: false });
    }
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }, [status, applySession]);

  return (
    <AuthContext.Provider value={{ session: localSession, ready, refresh, applySession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
