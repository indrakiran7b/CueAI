export type AdminRole = "Admin" | "Manager";

export type AdminSession = {
  email: string;
  name: string;
  role: AdminRole;
};

const ADMIN_SESSION_KEY = "cueai-admin-session";
const ADMIN_COOKIE = "cueai-admin";

/**
 * Legacy client-side admin form helpers.
 * Passwords are never read from NEXT_PUBLIC_* — use /login (server session).
 */

export function getAdminCookieName() {
  return ADMIN_COOKIE;
}

export function writeAdminCookie() {
  document.cookie = `${ADMIN_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=2592000`;
}

export function clearAdminCookie() {
  document.cookie = `${ADMIN_COOKIE}=; Path=/; Max-Age=0`;
}

export function isAdminEmail(_email: string) {
  return false;
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    if (!session?.email || !isAdminEmail(session.email)) return null;
    return session;
  } catch {
    return null;
  }
}

export function setAdminSession(session: AdminSession) {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  writeAdminCookie();
  return session;
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  clearAdminCookie();
}

export type AdminAuthResult =
  | { ok: true; session: AdminSession }
  | { ok: false; error: string };

export function loginAdmin(_input: {
  email: string;
  password: string;
}): AdminAuthResult {
  return {
    ok: false,
    error: "Use the workspace sign-in page at /login. Client-side admin passwords are no longer supported.",
  };
}

export function grantAdminIfAllowed(_email: string, _name?: string): AdminSession | null {
  return null;
}
