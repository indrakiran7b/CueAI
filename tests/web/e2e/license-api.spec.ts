import { test, expect } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const keypair = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

test.describe("License API", () => {
  test("activate rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/license/activate", {
      data: { licenseKey: "", deviceId: "", platform: "windows" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("validate rejects unknown license", async ({ request }) => {
    const res = await request.post("/api/license/validate", {
      data: {
        licenseKey: "CUEAI-CLIENT-FFFF-FFFF-FFFF-FFFF",
        deviceId: "00000000-0000-4000-8000-000000000099",
        platform: "windows",
      },
    });
    expect([404, 403, 400]).toContain(res.status());
    const body = await res.json();
    expect(body.state).toBeDefined();
  });
});
