export const authConfig = {
  url: (import.meta.env.VITE_KEYCLOAK_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8080",
  realm: (import.meta.env.VITE_KEYCLOAK_REALM as string | undefined) || "cueai",
  clientId: (import.meta.env.VITE_KEYCLOAK_CLIENT_ID as string | undefined) || "cueai-android",
  googleEnabled: String(import.meta.env.VITE_AUTH_GOOGLE_ENABLED).toLowerCase() === "true",
  appleEnabled: String(import.meta.env.VITE_AUTH_APPLE_ENABLED).toLowerCase() === "true",
  skipAuth: String(import.meta.env.VITE_SKIP_AUTH).toLowerCase() === "true",
};

export function realmUrl() {
  return `${authConfig.url}/realms/${authConfig.realm}`;
}

export function tokenEndpoint() {
  return `${realmUrl()}/protocol/openid-connect/token`;
}

export function logoutEndpoint() {
  return `${realmUrl()}/protocol/openid-connect/logout`;
}

export function resetPasswordUrl() {
  return `${realmUrl()}/login-actions/reset-credentials?client_id=${encodeURIComponent(authConfig.clientId)}`;
}

export function redirectUri() {
  return `${window.location.origin}/`;
}
