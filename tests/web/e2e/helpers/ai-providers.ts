import { createServer, type Server } from "node:http";
import { mkdir, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { uniqueUser } from "./auth";

export type ProviderType = "groq" | "openai" | "anthropic" | "gemini" | "custom";

export type PublicProvider = {
  id: string;
  type: ProviderType;
  hasApiKey: boolean;
  apiKeyMasked: string;
  apiKeyStatus: string;
  endpoint: string;
  enabled: boolean;
  name: string;
};

export type AiSummary = {
  providers: PublicProvider[];
  models: { id: string; name: string; providerId: string; isDefault: boolean }[];
  defaultModel: string;
  activeProvider: string;
};

export const SUPPORTED_PROVIDERS: { type: ProviderType; label: string }[] = [
  { type: "groq", label: "Groq" },
  { type: "openai", label: "OpenAI" },
  { type: "gemini", label: "Google Gemini" },
  { type: "anthropic", label: "Anthropic" },
];

export const REAL_KEYS: Partial<Record<ProviderType, string | undefined>> = {
  groq: process.env.GROQ_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
};

export const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "ai-providers");
export const REPORT_JSON = path.join(SCREENSHOT_DIR, "report-rows.json");
export const REPORT_MD = path.join(SCREENSHOT_DIR, "AI-PROVIDER-TEST-REPORT.md");

export type ReportRow = {
  provider: string;
  scenario: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "SKIP";
  screenshot?: string;
};

const STORE_PATHS = [
  path.join(process.cwd(), "apps", "web", ".data-e2e", "workspace-store.json"),
  path.join(process.cwd(), "apps", "web", ".data", "workspace-store.json"),
];

export function assertNoRawKey(body: string, secret: string) {
  if (secret.length >= 8) {
    expect(body).not.toContain(secret);
  }
}

export async function resetE2EStore() {
  await Promise.all(STORE_PATHS.map((storePath) => unlink(storePath).catch(() => undefined)));
}

async function signupAndLoginRequest(request: APIRequestContext) {
  const user = uniqueUser("ai");
  const signup = await request.post("/api/auth/signup", {
    data: {
      name: user.name,
      email: user.email,
      password: user.password,
      workspace: user.workspace,
    },
  });
  if (!signup.ok()) {
    throw new Error(`Signup failed: ${signup.status()}`);
  }
  const login = await request.post("/api/auth/login", {
    data: { email: user.email, password: user.password },
  });
  if (!login.ok()) {
    throw new Error(`Login failed: ${login.status()}`);
  }
  const onboarding = await request.put("/api/onboarding", {
    data: { skipped: true },
  });
  if (!onboarding.ok()) {
    throw new Error(`Onboarding skip failed: ${onboarding.status()}`);
  }
  return user;
}

/** API-only admin session (no browser navigation). */
export async function loginAsFreshAdmin(request: APIRequestContext) {
  await resetE2EStore();
  return signupAndLoginRequest(request);
}

/** Browser session for admin UI screenshots. */
export async function loginAsFreshAdminPage(page: Page) {
  await resetE2EStore();
  await signupAndLoginRequest(page.request);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).not.toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Admin portal", { exact: true })).toBeVisible({ timeout: 20_000 });
}

export async function getAi(request: APIRequestContext) {
  const res = await request.get("/api/admin/ai");
  expect(res.status()).toBe(200);
  return (await res.json()) as AiSummary;
}

export async function patchProvider(
  request: APIRequestContext,
  provider: Record<string, unknown>,
) {
  const res = await request.patch("/api/admin/ai", { data: { provider } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as AiSummary;
}

export function listenMock(
  handler: (
    url: string,
    headers: Record<string, string | string[] | undefined>,
  ) => { status: number; body: unknown; delayMs?: number },
): Promise<{ server: Server; base: string; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url || "");
    const result = handler(req.url || "", req.headers);
    const write = () => {
      const payload = JSON.stringify(result.body);
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(payload);
    };
    if (result.delayMs) setTimeout(write, result.delayMs);
    else write();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}`, hits });
    });
  });
}

export async function ensureReportFile() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  try {
    await readFile(REPORT_JSON, "utf8");
  } catch {
    await writeFile(REPORT_JSON, "[]", "utf8");
  }
}

export async function prepareVisualScreenshotDir() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const entries = await readdir(SCREENSHOT_DIR).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => name.endsWith(".png"))
      .map((name) => unlink(path.join(SCREENSHOT_DIR, name)).catch(() => undefined)),
  );
  await ensureReportFile();
}

export async function appendReportRow(row: ReportRow) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  let rows: ReportRow[] = [];
  try {
    rows = JSON.parse(await readFile(REPORT_JSON, "utf8")) as ReportRow[];
  } catch {
    rows = [];
  }
  rows.push(row);
  await writeFile(REPORT_JSON, JSON.stringify(rows, null, 2), "utf8");
}

export async function writeMarkdownReport() {
  let rows: ReportRow[] = [];
  try {
    rows = JSON.parse(await readFile(REPORT_JSON, "utf8")) as ReportRow[];
  } catch {
    rows = [];
  }

  const passed = rows.filter((r) => r.status === "PASS").length;
  const failed = rows.filter((r) => r.status === "FAIL").length;
  const skipped = rows.filter((r) => r.status === "SKIP").length;
  const lines = [
    "# AI Provider Test Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Passed | Failed | Skipped | Total |`,
    `|--------|--------|---------|-------|`,
    `| ${passed} | ${failed} | ${skipped} | ${rows.length} |`,
    "",
    "## Results",
    "",
    "| Provider | Scenario | Expected | Actual | Status | Screenshot |",
    "|----------|----------|----------|--------|--------|------------|",
    ...rows.map(
      (r) =>
        `| ${r.provider} | ${r.scenario} | ${r.expected} | ${r.actual} | ${r.status} | ${r.screenshot || "—"} |`,
    ),
    "",
    "Screenshots are stored under `test-results/ai-providers/`. No API keys are included in this report.",
    "",
  ];
  await writeFile(REPORT_MD, lines.join("\n"), "utf8");
}

export async function maskSensitiveFields(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('input[type="password"]').forEach((node) => {
      const input = node as HTMLInputElement;
      input.value = "";
      input.setAttribute("placeholder", "••••••••");
      input.style.background = "#e8e8ed";
      input.style.color = "transparent";
      input.style.textShadow = "0 0 0 #666";
    });
  });
}

export async function captureScreenshot(
  page: Page,
  filename: string,
  row: Omit<ReportRow, "screenshot">,
) {
  await maskSensitiveFields(page);
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  await appendReportRow({ ...row, screenshot: filename });
  return filePath;
}

export async function gotoAdminTab(page: Page, tab: "providers" | "models") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  const label = tab === "providers" ? "AI Providers" : "AI Models";
  const sidebar = page.locator("aside").getByRole("button", { name: label, exact: true });
  if (await sidebar.isVisible()) {
    await sidebar.click();
  } else {
    await page.getByRole("tab", { name: label }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
}

export async function addProviderViaUi(
  page: Page,
  type: ProviderType,
  displayName: string,
  apiKey?: string,
) {
  await gotoAdminTab(page, "providers");
  await page.getByLabel("Provider type").selectOption(type);
  await page.getByPlaceholder("Display name").fill(displayName);
  if (apiKey) {
    await page.getByPlaceholder("API key (optional)").fill(apiKey);
  }
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Provider added/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("row").filter({ hasText: displayName }).waitFor({ state: "visible" });
}

export async function saveProviderKeyViaUi(page: Page, displayName: string, apiKey: string) {
  const row = page.getByRole("row").filter({ hasText: displayName });
  await row.getByLabel(new RegExp(`${displayName} API key`, "i")).fill(apiKey);
  await row.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("status").filter({ hasText: /API key saved/i })).toBeVisible({
    timeout: 10_000,
  });
}

export async function clickProviderTest(page: Page, displayName: string) {
  const row = page.getByRole("row").filter({ hasText: displayName });
  await row.getByRole("button", { name: "Test" }).click();
}

export async function reloadAdminProviders(page: Page) {
  await page.getByRole("button", { name: "Refresh" }).click();
  await gotoAdminTab(page, "providers");
}

export function adminErrorBanner(page: Page) {
  return page.getByRole("alert").filter({
    hasText: /Provider responded|401|403|404|No API key|Connection failed|Invalid|fetch failed|ECONNREFUSED|timeout|network/i,
  });
}

export function adminSuccessBanner(page: Page) {
  return page.getByRole("status").filter({ hasText: /Connection successful|Provider added|API key saved|Model added/i });
}
