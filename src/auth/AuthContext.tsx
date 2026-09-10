import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authConfig } from "./config";
import {
  AuthError,
  completeRedirectLogin,
  loginWithPassword,
  loginWithProvider,
  logout as keycloakLogout,
  openForgotPassword,
  refreshTokens,
  registerWithEmail,
} from "./keycloak";
import { clearSession, loadSession, type AuthTokens, type AuthUser } from "./session";

const guestUser: AuthUser = {
  id: "guest",
  email: "guest@cueai.local",
  name: "Guest",
};

type AuthContextValue = {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  loading: boolean;
  error: string | null;
  skipAuth: boolean;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; fullName: string }) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  forgotPassword: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(authConfig.skipAuth ? guestUser : null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [loading, setLoading] = useState(!authConfig.skipAuth);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((session: { tokens: AuthTokens; user: AuthUser } | null) => {
    if (!session) {
      setUser(authConfig.skipAuth ? guestUser : null);
      setTokens(null);
      return;
    }
    setUser(session.user);
    setTokens(session.tokens);
  }, []);

  useEffect(() => {
    if (authConfig.skipAuth) {
      setUser(guestUser);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function boot() {
      try {
        const redirected = await completeRedirectLogin();
        if (cancelled) return;
        if (redirected) {
          applySession(redirected);
          return;
        }

        const existing = loadSession();
        if (!existing) return;

        if (existing.tokens.expiresAt > Date.now() + 30_000) {
          applySession(existing);
          return;
        }

        if (existing.tokens.refreshToken) {
          const refreshed = await refreshTokens(existing.tokens.refreshToken);
          if (!cancelled) applySession(refreshed);
          return;
        }

        clearSession();
      } catch (err) {
        clearSession();
        if (!cancelled) {
          setError(err instanceof AuthError ? err.message : "Authentication failed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const session = await loginWithPassword(email, password);
      applySession(session);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string }) => {
      setError(null);
      const session = await registerWithEmail(input);
      applySession(session);
    },
    [applySession],
  );

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    await loginWithProvider("google");
  }, []);

  const loginWithApple = useCallback(async () => {
    setError(null);
    await loginWithProvider("apple");
  }, []);

  const logout = useCallback(async () => {
    if (authConfig.skipAuth) {
      applySession(null);
      return;
    }
    const idToken = tokens?.idToken;
    applySession(null);
    await keycloakLogout(idToken);
  }, [applySession, tokens?.idToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      tokens,
      loading,
      error,
      skipAuth: authConfig.skipAuth,
      clearError: () => setError(null),
      login,
      register,
      loginWithGoogle,
      loginWithApple,
      forgotPassword: openForgotPassword,
      logout,
    }),
    [user, tokens, loading, error, login, register, loginWithGoogle, loginWithApple, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
