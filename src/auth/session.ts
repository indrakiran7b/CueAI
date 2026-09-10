export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  tokenType: string;
};

export type AuthUser = {
  id: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
};

const STORAGE_KEY = "cueai.auth.session";

type StoredSession = {
  tokens: AuthTokens;
  user: AuthUser;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function userFromIdToken(idToken?: string, accessToken?: string): AuthUser {
  const payload = decodeJwtPayload(idToken || accessToken || "") || {};
  const given = typeof payload.given_name === "string" ? payload.given_name : undefined;
  const family = typeof payload.family_name === "string" ? payload.family_name : undefined;
  const name =
    (typeof payload.name === "string" && payload.name) ||
    [given, family].filter(Boolean).join(" ") ||
    (typeof payload.preferred_username === "string" ? payload.preferred_username : undefined);

  return {
    id: String(payload.sub || "unknown"),
    email: typeof payload.email === "string" ? payload.email : undefined,
    name,
    givenName: given,
    familyName: family,
  };
}

export function tokensFromPasswordResponse(data: {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type?: string;
}): AuthTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type || "Bearer",
  };
}

export function saveSession(tokens: AuthTokens, user: AuthUser) {
  const payload: StoredSession = { tokens, user };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadSession(): StoredSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.tokens?.accessToken || !parsed.user?.id) return null;
    if (parsed.tokens.expiresAt <= Date.now() + 15_000) {
      // Prefer refresh in AuthContext; treat near-expiry as needing refresh.
      return parsed;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}
