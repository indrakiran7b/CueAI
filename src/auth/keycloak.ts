import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import {
  authConfig,
  redirectUri,
  resetPasswordUrl,
  tokenEndpoint,
} from "./config";
import {
  clearSession,
  saveSession,
  tokensFromPasswordResponse,
  userFromIdToken,
  type AuthTokens,
  type AuthUser,
} from "./session";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

let userManager: UserManager | null = null;

function getUserManager() {
  if (!userManager) {
    userManager = new UserManager({
      authority: `${authConfig.url}/realms/${authConfig.realm}`,
      client_id: authConfig.clientId,
      redirect_uri: redirectUri(),
      post_logout_redirect_uri: redirectUri(),
      response_type: "code",
      scope: "openid profile email",
      automaticSilentRenew: false,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    });
  }
  return userManager;
}

async function parseTokenResponse(res: Response): Promise<TokenResponse> {
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    if (detail.toLowerCase().includes("invalid_grant") || detail.toLowerCase().includes("invalid user")) {
      throw new AuthError("Invalid email or password.");
    }
    throw new AuthError(detail);
  }
  return data;
}

function persistFromTokens(tokens: AuthTokens): { tokens: AuthTokens; user: AuthUser } {
  const user = userFromIdToken(tokens.idToken, tokens.accessToken);
  saveSession(tokens, user);
  return { tokens, user };
}

export async function loginWithPassword(email: string, password: string) {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: authConfig.clientId,
    username: email.trim(),
    password,
    scope: "openid profile email",
  });

  let res: Response;
  try {
    res = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new AuthError("Cannot reach Keycloak. Start it with: npm run auth:up");
  }

  const data = await parseTokenResponse(res);
  return persistFromTokens(tokensFromPasswordResponse(data));
}

export async function registerWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  const parts = input.fullName.trim().split(/\s+/);
  const firstName = parts[0] || "CueAI";
  const lastName = parts.slice(1).join(" ") || "User";

  let res: Response;
  try {
    res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email.trim(),
        password: input.password,
        firstName,
        lastName,
      }),
    });
  } catch {
    throw new AuthError("Registration service unavailable. Is the Vite dev server running?");
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new AuthError(data.error || "Could not create account.");
  }

  return loginWithPassword(input.email, input.password);
}

export async function refreshTokens(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: authConfig.clientId,
    refresh_token: refreshToken,
  });

  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await parseTokenResponse(res);
  return persistFromTokens(tokensFromPasswordResponse(data));
}

export async function loginWithProvider(provider: "google" | "apple") {
  if (provider === "google" && !authConfig.googleEnabled) {
    throw new AuthError(
      "Google sign-in is not configured. Add GOOGLE_CLIENT_ID/SECRET, run npm run auth:social, then set VITE_AUTH_GOOGLE_ENABLED=true.",
    );
  }
  if (provider === "apple" && !authConfig.appleEnabled) {
    throw new AuthError(
      "Apple sign-in is not configured. Add Apple credentials, run npm run auth:social, then set VITE_AUTH_APPLE_ENABLED=true.",
    );
  }

  await getUserManager().signinRedirect({
    extraQueryParams: { kc_idp_hint: provider },
  });
}

function persistFromOidcUser(user: User) {
  if (!user.access_token) {
    throw new AuthError("Missing access token from identity provider.");
  }
  const tokens: AuthTokens = {
    accessToken: user.access_token,
    refreshToken: user.refresh_token,
    idToken: user.id_token,
    expiresAt: user.expires_at ? user.expires_at * 1000 : Date.now() + 300_000,
    tokenType: user.token_type || "Bearer",
  };
  return persistFromTokens(tokens);
}

export async function completeRedirectLogin() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("code") || !params.has("state")) {
    return null;
  }

  try {
    const user = await getUserManager().signinRedirectCallback();
    const session = persistFromOidcUser(user);
    window.history.replaceState({}, document.title, window.location.pathname);
    return session;
  } catch (err) {
    window.history.replaceState({}, document.title, window.location.pathname);
    const message = err instanceof Error ? err.message : "Social login failed.";
    throw new AuthError(message);
  }
}

export function openForgotPassword() {
  window.location.assign(resetPasswordUrl());
}

export async function logout(idToken?: string) {
  clearSession();
  try {
    await getUserManager().removeUser();
  } catch {
    // ignore
  }

  if (idToken) {
    const url = new URL(`${authConfig.url}/realms/${authConfig.realm}/protocol/openid-connect/logout`);
    url.searchParams.set("id_token_hint", idToken);
    url.searchParams.set("post_logout_redirect_uri", redirectUri());
    window.location.assign(url.toString());
    return;
  }
}
