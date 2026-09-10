/**
 * Vite plugin: POST /api/auth/register → Keycloak Admin API (local/dev only).
 */
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

function loadEnvFile(filePath: string) {
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

async function getAdminToken(baseUrl: string, admin: string, password: string) {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: admin,
    password,
  });
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Admin login failed");
  }
  return data.access_token;
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function authRegisterPlugin(): Plugin {
  return {
    name: "cueai-auth-register",
    configureServer(server) {
      loadEnvFile(path.resolve(process.cwd(), ".env"));
      loadEnvFile(path.resolve(process.cwd(), ".env.local"));

      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "POST" || req.url?.split("?")[0] !== "/api/auth/register") {
          next();
          return;
        }

        const keycloakUrl = (process.env.KEYCLOAK_URL || "http://localhost:8080").replace(/\/$/, "");
        const realm = process.env.VITE_KEYCLOAK_REALM || "cueai";
        const admin = process.env.KEYCLOAK_ADMIN || "admin";
        const password = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";

        try {
          const body = await readJson(req);
          const email = String(body.email || "").trim().toLowerCase();
          const userPassword = String(body.password || "");
          const firstName = String(body.firstName || "CueAI").trim();
          const lastName = String(body.lastName || "User").trim();

          if (!email || !userPassword) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Email and password are required." }));
            return;
          }
          if (userPassword.length < 8) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Password must be at least 8 characters." }));
            return;
          }

          const token = await getAdminToken(keycloakUrl, admin, password);
          const createRes = await fetch(`${keycloakUrl}/admin/realms/${realm}/users`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: email,
              email,
              enabled: true,
              emailVerified: true,
              firstName,
              lastName,
              credentials: [{ type: "password", value: userPassword, temporary: false }],
            }),
          });

          if (createRes.status === 201 || createRes.status === 204) {
            res.statusCode = 201;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          const errText = await createRes.text();
          let message = "Could not create account.";
          if (createRes.status === 409 || errText.toLowerCase().includes("exists")) {
            message = "An account with this email already exists.";
          } else if (errText) {
            try {
              const parsed = JSON.parse(errText) as { errorMessage?: string; error?: string };
              message = parsed.errorMessage || parsed.error || message;
            } catch {
              // keep default
            }
          }

          res.statusCode = createRes.status === 409 ? 409 : 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: message }));
        } catch (err) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                err instanceof Error
                  ? `Keycloak unavailable: ${err.message}. Run npm run auth:up`
                  : "Keycloak unavailable.",
            }),
          );
        }
      });
    },
  };
}
