import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq <= 0) continue;
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  if (key && process.env[key] === undefined) process.env[key] = value;
}
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";

const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const store = JSON.parse(
  readFileSync(path.join(root, ".data", "workspace-store.json"), "utf8"),
) as {
  workspace?: { name?: string };
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    workspaceId: string;
  }>;
};
const user = store.users.find((u) => u.status === "Active");
if (!user) throw new Error("no_active_user");
const token = signSession({
  userId: user.id,
  email: user.email,
  name: user.name,
  role: user.role as "User" | "Admin" | "Manager",
  workspaceId: user.workspaceId,
  workspace: store.workspace?.name || "Workspace",
});

async function postCheckout(planId: string, cookie?: string) {
  const res = await fetch("http://127.0.0.1:3000/api/billing/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ planId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
    requestId?: string;
  };
  let host = "";
  try {
    host = body.url ? new URL(body.url).host : "";
  } catch {
    host = "";
  }
  return {
    planId,
    status: res.status,
    hasUrl: Boolean(body.url),
    host,
    stripeCheckout: host.includes("checkout.stripe.com"),
    error: body.error || null,
    requestId: body.requestId || null,
  };
}

const unauth = await postCheckout("pro_monthly");
const pro = await postCheckout("pro_monthly", `${SESSION_COOKIE}=${token}`);
const team = await postCheckout("team_monthly", `${SESSION_COOKIE}=${token}`);
const invalid = await postCheckout("not-a-plan", `${SESSION_COOKIE}=${token}`);
const free = await postCheckout("free", `${SESSION_COOKIE}=${token}`);

const webhookNoSig = await fetch("http://127.0.0.1:3000/api/stripe/webhook", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
const webhookAlias = webhookNoSig.status;
const webhookCanonical = (
  await fetch("http://127.0.0.1:3000/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  })
).status;

console.log(
  JSON.stringify(
    {
      unauth,
      pro,
      team,
      invalid,
      free,
      webhookAlias,
      webhookCanonical,
    },
    null,
    2,
  ),
);
