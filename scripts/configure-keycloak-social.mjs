/**
 * Configure Google / Apple identity providers in the local cueai Keycloak realm.
 * Usage: node scripts/configure-keycloak-social.mjs
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const keycloakUrl = (process.env.KEYCLOAK_URL || "http://localhost:8080").replace(/\/$/, "");
const realm = process.env.VITE_KEYCLOAK_REALM || "cueai";
const admin = process.env.KEYCLOAK_ADMIN || "admin";
const password = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: admin,
    password,
  });
  const res = await fetch(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Admin auth failed");
  return data.access_token;
}

async function upsertIdp(token, alias, providerId, config) {
  const listRes = await fetch(`${keycloakUrl}/admin/realms/${realm}/identity-provider/instances`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = await listRes.json();
  const existing = Array.isArray(list) ? list.find((x) => x.alias === alias) : null;

  const payload = {
    alias,
    providerId,
    enabled: true,
    trustEmail: true,
    storeToken: false,
    firstBrokerLoginFlowAlias: "first broker login",
    config,
  };

  const url = existing
    ? `${keycloakUrl}/admin/realms/${realm}/identity-provider/instances/${alias}`
    : `${keycloakUrl}/admin/realms/${realm}/identity-provider/instances`;

  const res = await fetch(url, {
    method: existing ? "PUT" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Failed to upsert ${alias}: ${res.status} ${text}`);
  }
  console.log(`${existing ? "Updated" : "Created"} identity provider: ${alias}`);
}

async function main() {
  const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const appleServicesId = process.env.APPLE_SERVICES_ID?.trim();
  const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
  const appleKeyId = process.env.APPLE_KEY_ID?.trim();
  const appleKeyPath = process.env.APPLE_PRIVATE_KEY_PATH?.trim();

  if (!googleId && !appleServicesId) {
    console.log("No GOOGLE_* or APPLE_* credentials in .env — nothing to configure.");
    console.log("Email/password auth still works with the demo user.");
    process.exit(0);
  }

  const token = await getAdminToken();

  if (googleId && googleSecret) {
    await upsertIdp(token, "google", "google", {
      clientId: googleId,
      clientSecret: googleSecret,
      defaultScope: "openid profile email",
      syncMode: "IMPORT",
    });
    console.log("Set VITE_AUTH_GOOGLE_ENABLED=true in .env and restart Vite.");
  } else if (googleId || googleSecret) {
    console.warn("Google: both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.");
  }

  if (appleServicesId && appleTeamId && appleKeyId && appleKeyPath) {
    const privateKey = fs.readFileSync(path.resolve(appleKeyPath), "utf8");
    await upsertIdp(token, "apple", "apple", {
      clientId: appleServicesId,
      teamId: appleTeamId,
      keyId: appleKeyId,
      privateKey,
      defaultScope: "name email",
      syncMode: "IMPORT",
    });
    console.log("Set VITE_AUTH_APPLE_ENABLED=true in .env and restart Vite.");
  } else if (appleServicesId || appleTeamId || appleKeyId || appleKeyPath) {
    console.warn(
      "Apple: APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY_PATH are all required.",
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
