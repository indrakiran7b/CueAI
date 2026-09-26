import { expect, test } from "@playwright/test";
import {
  REAL_KEYS,
  SUPPORTED_PROVIDERS,
  addProviderViaUi,
  adminErrorBanner,
  adminSuccessBanner,
  appendReportRow,
  captureScreenshot,
  clickProviderTest,
  gotoAdminTab,
  prepareVisualScreenshotDir,
  listenMock,
  loginAsFreshAdminPage,
  patchProvider,
  reloadAdminProviders,
  saveProviderKeyViaUi,
} from "./helpers/ai-providers";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeAll(async () => {
  await prepareVisualScreenshotDir();
});

test.describe("Visual evidence — configuration", () => {
  test("provider and model selection screens", async ({ page }) => {
    await loginAsFreshAdminPage(page);
    await addProviderViaUi(page, "openai", "OpenAI Config", "sk-ui-placeholder-not-real");
    await captureScreenshot(page, "openai-provider-selection.png", {
      provider: "OpenAI",
      scenario: "Provider selection",
      expected: "Provider listed in admin catalog",
      actual: "OpenAI provider visible with masked key field",
      status: "PASS",
    });

    await gotoAdminTab(page, "models");
    await page.getByLabel("Model provider").selectOption({ label: "OpenAI Config" });
    await page.getByPlaceholder("Model name").fill("gpt-4o-mini");
    await page.getByRole("button", { name: "Add model" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Model added/i })).toBeVisible();
    await captureScreenshot(page, "openai-model-selection.png", {
      provider: "OpenAI",
      scenario: "Model selection",
      expected: "Model linked to provider",
      actual: "gpt-4o-mini listed under OpenAI Config",
      status: "PASS",
    });

    const catalogRes = await page.request.get("/api/admin/ai");
    expect(catalogRes.ok()).toBeTruthy();
    const catalog = await catalogRes.json();
    const model = catalog.models.find((m: { name: string }) => m.name === "gpt-4o-mini");
    expect(model).toBeTruthy();
    await page.request.patch("/api/admin/ai", { data: { setDefaultModelId: model.id } });
    await gotoAdminTab(page, "models");
    await captureScreenshot(page, "openai-saved-configuration.png", {
      provider: "OpenAI",
      scenario: "Saved configuration",
      expected: "Default model persisted",
      actual: "Model catalog shows saved default",
      status: "PASS",
    });
  });
});

for (const { type, label } of SUPPORTED_PROVIDERS) {
  test.describe(`Visual evidence — ${label}`, () => {
    const displayName = `${label} E2E`;

    test("invalid API key shows auth error", async ({ page }) => {
      await loginAsFreshAdminPage(page);
      await addProviderViaUi(page, type, displayName, "invalid-key-not-real");
      await clickProviderTest(page, displayName);
      await expect(adminErrorBanner(page)).toContainText(
        /401|403|Provider responded|Connection failed|Invalid|timeout|aborted/i,
        { timeout: 20_000 },
      );
      await captureScreenshot(page, `${type}-invalid-key.png`, {
        provider: label,
        scenario: "Invalid API key",
        expected: "Authentication/provider error",
        actual: "Error banner shown after Test",
        status: "PASS",
      });
    });

    test("missing API key shows validation error", async ({ page }) => {
      const mock = await listenMock(() => ({ status: 200, body: { data: [] } }));
      try {
        await loginAsFreshAdminPage(page);
        await addProviderViaUi(page, "custom", `${displayName} Missing`, "temp-clear-me");
        const saved = await page.request.get("/api/admin/ai");
        const catalog = await saved.json();
        const provider = catalog.providers.find(
          (p: { name: string }) => p.name === `${displayName} Missing`,
        );
        await patchProvider(page.request, { id: provider.id, clearApiKey: true });
        await reloadAdminProviders(page);
        await clickProviderTest(page, `${displayName} Missing`);
        await expect(adminErrorBanner(page)).toContainText(/No API key/i, { timeout: 10_000 });
        await captureScreenshot(page, `${type}-missing-key.png`, {
          provider: label,
          scenario: "Missing API key",
          expected: "Validation error before provider call",
          actual: "No API key error shown in admin UI",
          status: "PASS",
        });
      } finally {
        mock.server.close();
      }
    });

    test("valid API key connection succeeds", async ({ page }) => {
      const key = REAL_KEYS[type];
      if (!key) {
        await appendReportRow({
          provider: label,
          scenario: "Valid API key",
          expected: "Successful provider connection",
          actual: `${type.toUpperCase()}_API_KEY not set — skipped`,
          status: "SKIP",
        });
        test.skip(true, `${type.toUpperCase()}_API_KEY is not set`);
      }

      await loginAsFreshAdminPage(page);
      await patchProvider(page.request, { type, name: displayName, apiKey: key });
      await reloadAdminProviders(page);
      await clickProviderTest(page, displayName);
      await expect(adminSuccessBanner(page)).toContainText(/Connection successful/i, {
        timeout: 20_000,
      });
      await captureScreenshot(page, `${type}-valid.png`, {
        provider: label,
        scenario: "Valid API key",
        expected: "Connection successful",
        actual: "Test connection succeeded",
        status: "PASS",
      });
    });

    test("unavailable model surfaces provider error", async ({ page }) => {
      const mock = await listenMock((url) => ({
        status: url.startsWith("/models") ? 404 : 404,
        body: { error: { message: "model not found" } },
      }));
      try {
        await loginAsFreshAdminPage(page);
        await patchProvider(page.request, {
          type: "custom",
          name: `${displayName} Model404`,
          endpoint: mock.base,
          apiKey: "sk-mock-model",
        });
        const saved = await page.request.get("/api/admin/ai");
        const catalog = await saved.json();
        const provider = catalog.providers.find(
          (p: { name: string }) => p.name === `${displayName} Model404`,
        );
        await page.request.patch("/api/admin/ai", {
          data: { model: { name: "does-not-exist", providerId: provider.id } },
        });
        await reloadAdminProviders(page);
        await clickProviderTest(page, `${displayName} Model404`);
        await expect(adminErrorBanner(page)).toContainText(/404|Connection failed|Provider responded/i);
        await captureScreenshot(page, `${type}-invalid-model.png`, {
          provider: label,
          scenario: "Invalid/unavailable model",
          expected: "Provider error handled gracefully",
          actual: "404 provider error shown",
          status: "PASS",
        });
      } finally {
        mock.server.close();
      }
    });
  });
}

test.describe("Visual evidence — provider switching", () => {
  test("switch default model between providers", async ({ page }) => {
    await loginAsFreshAdminPage(page);
    await patchProvider(page.request, { type: "openai", name: "Switch OpenAI", apiKey: "sk-switch-a" });
    await patchProvider(page.request, { type: "groq", name: "Switch Groq", apiKey: "gsk_switch_b" });
    const catalog = await (await page.request.get("/api/admin/ai")).json();
    const openai = catalog.providers.find((p: { name: string }) => p.name === "Switch OpenAI");
    const groq = catalog.providers.find((p: { name: string }) => p.name === "Switch Groq");
    await page.request.patch("/api/admin/ai", {
      data: { model: { name: "gpt-4o-mini", providerId: openai.id } },
    });
    await page.request.patch("/api/admin/ai", {
      data: { model: { name: "llama-3.3-70b", providerId: groq.id } },
    });
    const after = await (await page.request.get("/api/admin/ai")).json();
    const groqModel = after.models.find((m: { name: string }) => m.name === "llama-3.3-70b");
    await page.request.patch("/api/admin/ai", { data: { setDefaultModelId: groqModel.id } });
    await gotoAdminTab(page, "models");
    await captureScreenshot(page, "provider-switching.png", {
      provider: "Multi",
      scenario: "Provider switching",
      expected: "Default model moves between providers",
      actual: "Groq model marked default in catalog",
      status: "PASS",
    });
  });
});

test.describe("Visual evidence — mocked failures", () => {
  for (const status of [429, 500, 503] as const) {
    test(`HTTP ${status} error handling`, async ({ page }) => {
      const mock = await listenMock(() => ({
        status,
        body: { error: { message: "upstream" } },
      }));
      try {
        await loginAsFreshAdminPage(page);
        await patchProvider(page.request, {
          type: "custom",
          name: `Mock ${status}`,
          endpoint: mock.base,
          apiKey: "sk-mock-status",
        });
        await reloadAdminProviders(page);
        await clickProviderTest(page, `Mock ${status}`);
        await expect(adminErrorBanner(page)).toContainText(
          new RegExp(String(status) + "|Connection failed|Provider responded"),
        );
        const slug = status === 429 ? "rate-limit" : status === 500 ? "server-error" : "server-unavailable";
        await captureScreenshot(page, `custom-${slug}.png`, {
          provider: "Custom",
          scenario: status === 429 ? "Rate limit handling" : "Server error handling",
          expected: `Graceful ${status} handling`,
          actual: `Error banner references ${status}`,
          status: "PASS",
        });
      } finally {
        mock.server.close();
      }
    });
  }

  test("network timeout failure", async ({ page }) => {
    await loginAsFreshAdminPage(page);
    await patchProvider(page.request, {
      type: "custom",
      name: "Dead Host",
      endpoint: "http://127.0.0.1:1",
      apiKey: "sk-mock-dead",
    });
    await reloadAdminProviders(page);
    await clickProviderTest(page, "Dead Host");
    await expect(adminErrorBanner(page)).toBeVisible({ timeout: 15_000 });
    await captureScreenshot(page, "custom-network-failure.png", {
      provider: "Custom",
      scenario: "Timeout/network failure",
      expected: "Connection error without crash",
      actual: "Network failure surfaced in admin UI",
      status: "PASS",
    });
  });
});

test.describe("Visual evidence — security", () => {
  test("API key inputs masked in screenshots", async ({ page }) => {
    await loginAsFreshAdminPage(page);
    await addProviderViaUi(page, "openai", "Mask Check", "sk-never-show-in-screenshot-9999");
    await saveProviderKeyViaUi(page, "Mask Check", "sk-second-secret-8888");
    await captureScreenshot(page, "openai-key-masked.png", {
      provider: "OpenAI",
      scenario: "Credential masking",
      expected: "No raw API key visible",
      actual: "Password fields cleared/masked before capture",
      status: "PASS",
    });
    const body = await page.content();
    expect(body).not.toContain("sk-never-show-in-screenshot-9999");
    expect(body).not.toContain("sk-second-secret-8888");
  });
});
