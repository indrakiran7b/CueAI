export type AdminRole = "Admin" | "Manager";

export type AdminSession = {
  email: string;
  name: string;
  role: AdminRole;
};

const ADMIN_SESSION_KEY = "cueai-admin-session";
const ADMIN_COOKIE = "cueai-admin";

export const ADMIN_BOOTSTRAP = {
  email: "user2071018416@cueai.local",
  password: "password123",
  name: "User 2071018416",
  role: "Admin" as AdminRole,
};

const ADMIN_ACCOUNTS: Array<{
  email: string;
  password: string;
  name: string;
  role: AdminRole;
}> = [
  ADMIN_BOOTSTRAP,
  {
    email: process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase() || "",
    password: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "",
    name: "CueAI Admin",
    role: "Admin" as AdminRole,
  },
].filter((a) => a.email && a.password);

export function getAdminCookieName() {
  return ADMIN_COOKIE;
}

export function writeAdminCookie() {
  document.cookie = `${ADMIN_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=2592000`;
}

export function clearAdminCookie() {
  document.cookie = `${ADMIN_COOKIE}=; Path=/; Max-Age=0`;
}

function accountFor(email: string) {
  return ADMIN_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase());
}

export function isAdminEmail(email: string) {
  return Boolean(accountFor(email));
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

export function loginAdmin(input: {
  email: string;
  password: string;
}): AdminAuthResult {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const account = accountFor(email);
  if (!account) {
    return {
      ok: false,
      error: "This account is not an Admin. Use an Admin email to continue.",
    };
  }
  if (password !== account.password) {
    return { ok: false, error: "Incorrect password. Please try again." };
  }

  return {
    ok: true,
    session: setAdminSession({
      email: account.email,
      name: account.name,
      role: account.role,
    }),
  };
}

export function grantAdminIfAllowed(email: string, name?: string): AdminSession | null {
  const account = accountFor(email);
  if (!account) return null;
  return setAdminSession({
    email: account.email,
    name: name?.trim() || account.name,
    role: account.role,
  });
}
