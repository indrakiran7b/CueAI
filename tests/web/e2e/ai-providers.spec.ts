import { expect, test } from "@playwright/test";
import {
  REAL_KEYS,
  appendReportRow,
  assertNoRawKey,
  getAi,
  listenMock,
  loginAsFreshAdmin,
  patchProvider,
  ensureReportFile,
} from "./helpers/ai-providers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureReportFile();
});

test.describe("configuration", () => {
  test("select provider and model, save, persist, change, and remove a key", async ({ request }) => {
    await loginAsFreshAdmin(request);
    const created = await patchProvider(request, {
      type: "openai",
      name: "OpenAI test",
      apiKey: "sk-test-config-key-0001",
    });
    const provider = created.providers.find((p) => p.type === "openai" && p.hasApiKey);
    expect(provider).toBeTruthy();
    expect(provider!.apiKeyStatus).toBe("Configured");
    expect(provider!.apiKeyMasked).not.toContain("sk-test-config-key-0001");
    assertNoRawKey(JSON.stringify(created), "sk-test-config-key-0001");

    const withModel = await request.patch("/api/admin/ai", {
      data: {
        model: { name: "gpt-4o-mini", providerId: provider!.id, capability: "chat" },
      },
    });
    expect(withModel.ok()).toBeTruthy();
    const afterModel = (await withModel.json()) as { models: { name: string; providerId: string }[] };
    const model = afterModel.models.find((m) => m.name === "gpt-4o-mini");
    expect(model?.providerId).toBe(provider!.id);

    const def = await request.patch("/api/admin/ai", {
      data: { setDefaultModelId: model!.id },
    });
    const afterDefault = (await def.json()) as { defaultModel: string };
    expect(afterDefault.defaultModel).toBe("gpt-4o-mini");

    const again = await getAi(request);
    expect(again.providers.find((p) => p.id === provider!.id)?.hasApiKey).toBe(true);
    expect(again.defaultModel).toBe("gpt-4o-mini");

    const changed = await patchProvider(request, {
      id: provider!.id,
      apiKey: "sk-test-config-key-0002",
    });
    const masked = changed.providers.find((p) => p.id === provider!.id)?.apiKeyMasked || "";
    expect(masked.endsWith("0002") || masked.includes("0002")).toBeTruthy();
    assertNoRawKey(JSON.stringify(changed), "sk-test-config-key-0002");

    const cleared = await patchProvider(request, {
      id: provider!.id,
      clearApiKey: true,
    });
    expect(cleared.providers.find((p) => p.id === provider!.id)?.hasApiKey).toBe(false);

    await appendReportRow({
      provider: "OpenAI",
      scenario: "Configuration lifecycle",
      expected: "Save, persist, change, remove key",
      actual: "All configuration API steps succeeded",
      status: "PASS",
    });
  });
});

test.describe("valid credentials (real providers, env required)", () => {
  for (const type of ["groq", "openai", "gemini", "anthropic"] as const) {
    test(`${type} connection succeeds with env credential`, async ({ request }) => {
      const key = REAL_KEYS[type];
      if (!key) {
        await appendReportRow({
          provider: type,
          scenario: "Valid API key (API)",
          expected: "Successful connection",
          actual: `${type.toUpperCase()}_API_KEY not set — skipped`,
          status: "SKIP",
        });
        test.skip(true, `${type.toUpperCase()}_API_KEY is not set`);
      }
      await loginAsFreshAdmin(request);
      const saved = await patchProvider(request, {
        type,
        name: `${type} live`,
        apiKey: key,
      });
      const provider = saved.providers.find((p) => p.type === type && p.hasApiKey);
      expect(provider).toBeTruthy();
      assertNoRawKey(JSON.stringify(saved), key!);

      const probe = await request.post("/api/admin/ai", {
        data: { providerId: provider!.id },
      });
      const body = await probe.json();
      expect(body.ok, JSON.stringify({ error: body.error, status: probe.status() })).toBe(true);
      expect(body.providerId).toBe(provider!.id);
      assertNoRawKey(JSON.stringify(body), key!);

      await appendReportRow({
        provider: type,
        scenario: "Valid API key (API)",
        expected: "Successful connection",
        actual: "Connection probe returned ok",
        status: "PASS",
      });
    });
  }
});

test.describe("invalid credentials", () => {
  test("invalid key fails without crashing", async ({ request }) => {
    await loginAsFreshAdmin(request);
    const saved = await patchProvider(request, {
      type: "groq",
      name: "Groq invalid",
      apiKey: "invalid-key-not-real",
    });
    const provider = saved.providers.find((p) => p.name === "Groq invalid");
    const probe = await request.post("/api/admin/ai", {
      data: { providerId: provider!.id },
    });
    const body = await probe.json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/401|403|Provider responded/i);
    expect(probe.status()).toBeLessThan(500);

    await appendReportRow({
      provider: "Groq",
      scenario: "Invalid API key (API)",
      expected: "Auth error",
      actual: String(body.error),
      status: "PASS",
    });
  });
});

test.describe("missing API key", () => {
  test("refuses the request before calling the provider", async ({ request }) => {
    const mock = await listenMock(() => ({ status: 200, body: { data: [] } }));
    try {
      await loginAsFreshAdmin(request);
      const saved = await patchProvider(request, {
        type: "custom",
        name: "Empty key",
        endpoint: mock.base,
        apiKey: "temp-key-remove-me",
      });
      const provider = saved.providers.find((p) => p.name === "Empty key")!;
      await patchProvider(request, { id: provider.id, clearApiKey: true });
      const before = mock.hits.length;
      const probe = await request.post("/api/admin/ai", {
        data: { providerId: provider.id },
      });
      expect(probe.status()).toBe(400);
      const body = await probe.json();
      expect(body.ok).toBe(false);
      expect(String(body.error)).toMatch(/No API key/i);
      expect(mock.hits.length).toBe(before);

      await appendReportRow({
        provider: "Custom",
        scenario: "Missing API key (API)",
        expected: "Local validation, no outbound call",
        actual: "400 before mock provider hit",
        status: "PASS",
      });
    } finally {
      mock.server.close();
    }
  });
});

test.describe("provider/model mismatch", () => {
  test("does not send provider A credentials to provider B", async ({ request }) => {
    let seenAuth = "";
    const mock = await listenMock((_url, headers) => {
      const auth = headers.authorization;
      seenAuth = Array.isArray(auth) ? auth[0] || "" : auth || "";
      return { status: 200, body: { data: [] } };
    });
    try {
      await loginAsFreshAdmin(request);
      await patchProvider(request, {
        type: "openai",
        name: "Provider A",
        apiKey: "sk-provider-a-secret-9999",
      });
      const b = await patchProvider(request, {
        type: "custom",
        name: "Provider B",
        endpoint: mock.base,
        apiKey: "sk-provider-b-only",
      });
      const providerB = b.providers.find((p) => p.name === "Provider B")!;
      const probe = await request.post("/api/admin/ai", {
        data: { providerId: providerB.id },
      });
      const body = await probe.json();
      expect(body.ok).toBe(true);
      expect(seenAuth).toContain("sk-provider-b-only");
      expect(seenAuth).not.toContain("sk-provider-a-secret-9999");

      await appendReportRow({
        provider: "Multi",
        scenario: "Provider credential isolation",
        expected: "Only provider B key sent",
        actual: "Authorization header matched provider B",
        status: "PASS",
      });
    } finally {
      mock.server.close();
    }
  });
});

test.describe("model unavailable and provider errors (mocked)", () => {
  test("unavailable model list is reported as a provider error", async ({ request }) => {
    const mock = await listenMock((url) => {
      if (url.startsWith("/models")) {
        return { status: 404, body: { error: { message: "model not found" } } };
      }
      return { status: 404, body: {} };
    });
    try {
      await loginAsFreshAdmin(request);
      const saved = await patchProvider(request, {
        type: "custom",
        name: "Missing model",
        endpoint: mock.base,
        apiKey: "sk-mock",
      });
      const provider = saved.providers.find((p) => p.name === "Missing model")!;
      await request.patch("/api/admin/ai", {
        data: { model: { name: "does-not-exist", providerId: provider.id } },
      });
      const probe = await request.post("/api/admin/ai", {
        data: { providerId: provider.id },
      });
      const body = await probe.json();
      expect(body.ok).toBe(false);
      expect(String(body.error)).toMatch(/404/);
      expect(probe.status()).toBeLessThan(500);
    } finally {
      mock.server.close();
    }
  });

  for (const status of [429, 500, 502, 503]) {
    test(`handles HTTP ${status} without crashing`, async ({ request }) => {
      const mock = await listenMock(() => ({
        status,
        body: { error: { message: "upstream" } },
      }));
      try {
        await loginAsFreshAdmin(request);
        const saved = await patchProvider(request, {
          type: "custom",
          name: `Fail ${status}`,
          endpoint: mock.base,
          apiKey: "sk-mock",
        });
        const provider = saved.providers.find((p) => p.name === `Fail ${status}`)!;
        const probe = await request.post("/api/admin/ai", {
          data: { providerId: provider.id },
        });
        const body = await probe.json();
        expect(body.ok).toBe(false);
        expect(String(body.error)).toContain(String(status));
        expect(probe.status()).toBeLessThan(500);
      } finally {
        mock.server.close();
      }
    });
  }

  test("network failure is returned as a connection error", async ({ request }) => {
    await loginAsFreshAdmin(request);
    const saved = await patchProvider(request, {
      type: "custom",
      name: "Dead host",
      endpoint: "http://127.0.0.1:1",
      apiKey: "sk-mock",
    });
    const provider = saved.providers.find((p) => p.name === "Dead host")!;
    const probe = await request.post("/api/admin/ai", {
      data: { providerId: provider.id },
    });
    const body = await probe.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
    expect(probe.status()).toBeLessThan(500);
  });
});

test.describe("security", () => {
  test("catalog responses only expose a masked key", async ({ request }) => {
    await loginAsFreshAdmin(request);
    const secret = "sk-live-should-never-leak-4242";
    const saved = await patchProvider(request, {
      type: "openai",
      name: "Masked",
      apiKey: secret,
    });
    const raw = JSON.stringify(saved);
    assertNoRawKey(raw, secret);
    const provider = saved.providers.find((p) => p.name === "Masked")!;
    expect(provider.apiKeyMasked.startsWith("sk-l")).toBeTruthy();
    expect(provider.apiKeyMasked.endsWith("4242")).toBeTruthy();
    expect(provider.apiKeyMasked).toContain("••••");
  });
});
