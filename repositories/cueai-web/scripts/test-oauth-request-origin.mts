import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import {
  isElectronUserAgent,
  originFromRequest,
  withBrowserOAuthOrigin,
} from "../src/lib/server/oauth-request-origin";

test("Electron loopback OAuth stays on 127.0.0.1 even when Host is localhost", () => {
  const req = new NextRequest("http://localhost:3000/api/auth/signin/google", {
    headers: {
      host: "localhost:3000",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CueAI/1.0.0 Chrome/138.0.7204.251 Electron/37.10.3 Safari/537.36",
    },
  });
  assert.equal(originFromRequest(req), "http://127.0.0.1:3000");
});

test("session requests do not rewrite AUTH_URL", async () => {
  process.env.AUTH_URL = "http://127.0.0.1:3000";
  const req = new NextRequest("http://localhost:3000/api/auth/session", {
    headers: { host: "localhost:3000" },
  });
  await withBrowserOAuthOrigin(req, async () => {
    assert.equal(process.env.AUTH_URL, "http://127.0.0.1:3000");
    return null;
  });
  assert.equal(process.env.AUTH_URL, "http://127.0.0.1:3000");
});

test("127.0.0.1 OAuth handshake reaches Auth.js without the localhost rewrite", async () => {
  process.env.AUTH_URL = "http://127.0.0.1:3000";
  const req = new NextRequest("http://127.0.0.1:3000/api/auth/signin/google", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
    },
    body: "csrfToken=abc&callbackUrl=%2Fdashboard",
  });
  await withBrowserOAuthOrigin(req, async (aligned) => {
    assert.equal(new URL(aligned.url).host, "127.0.0.1:3000");
    assert.equal(aligned.headers.get("host"), "127.0.0.1:3000");
    assert.equal(process.env.AUTH_URL, undefined);
    assert.equal(await aligned.text(), "csrfToken=abc&callbackUrl=%2Fdashboard");
    return null;
  });
  assert.equal(process.env.AUTH_URL, "http://127.0.0.1:3000");
});

test("browser localhost OAuth keeps the browser host", () => {
  const req = new NextRequest("http://localhost:3000/api/auth/signin/google", {
    headers: {
      host: "localhost:3000",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  assert.equal(originFromRequest(req), "http://localhost:3000");
  assert.equal(isElectronUserAgent(req.headers.get("user-agent")), false);
});
