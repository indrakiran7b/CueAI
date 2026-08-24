export type CueUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  workspace: string;
  createdAt: string;
};

export type CueSession = {
  userId: string;
  name: string;
  email: string;
  workspace: string;
};

const USERS_KEY = "cueai-users";
const SESSION_KEY = "cueai-session";

/** Temporary local bypass — set NEXT_PUBLIC_SKIP_AUTH=false to re-enable login. */
export const AUTH_BYPASS =
  process.env.NEXT_PUBLIC_SKIP_AUTH !== "false" &&
  process.env.NEXT_PUBLIC_SKIP_AUTH !== "0";

export const DEV_GUEST_SESSION: CueSession = {
  userId: "dev-guest",
  name: "Indra",
  email: "dev@cueai.local",
  workspace: "Indra's Workspace",
};

function readUsers(): CueUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as CueUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: CueUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getSession(): CueSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as CueSession;
  } catch {
    // ignore
  }
  if (AUTH_BYPASS) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(DEV_GUEST_SESSION));
    return { ...DEV_GUEST_SESSION };
  }
  return null;
}

function setSession(user: CueUser) {
  const session: CueSession = {
    userId: user.id,
    name: user.name,
    email: user.email,
    workspace: user.workspace,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function workspaceFromName(name: string) {
  const first = name.trim().split(/\s+/)[0] || "My";
  return `${first}'s Workspace`;
}

export type AuthResult =
  | { ok: true; session: CueSession }
  | { ok: false; error: string };

export function signupWithEmail(input: {
  name: string;
  email: string;
  password: string;
}): AuthResult {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name) return { ok: false, error: "Please enter your full name." };
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const users = readUsers();
  if (users.some((u) => u.email === email)) {
    return {
      ok: false,
      error: "An account with this email already exists. Please sign in.",
    };
  }

  const user: CueUser = {
    id: crypto.randomUUID(),
    name,
    email,
    password,
    workspace: workspaceFromName(name),
    createdAt: new Date().toISOString(),
  };

  writeUsers([...users, user]);
  return { ok: true, session: setSession(user) };
}

export function loginWithEmail(input: {
  email: string;
  password: string;
}): AuthResult {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const user = readUsers().find((u) => u.email === email);
  if (!user) {
    return {
      ok: false,
      error: "No account found with this email. Please sign up first.",
    };
  }
  if (user.password !== password) {
    return { ok: false, error: "Incorrect password. Please try again." };
  }

  return { ok: true, session: setSession(user) };
}

export function greetingFor(name: string) {
  const hour = new Date().getHours();
  const first = name.trim().split(/\s+/)[0] || "there";
  const hi =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${hi}, ${first}`;
}
