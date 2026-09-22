import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        // Isolate E2E from the real workspace store so Admin Portal never
        // surfaces Playwright "E2E Tester" accounts as production data.
        command: "npm run dev:web",
        cwd: __dirname,
        url: baseURL,
        reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER === "1",
        timeout: 120_000,
        env: {
          ...process.env,
          CUEAI_DATA_DIR: `${__dirname}/apps/web/.data-e2e`,
          // E2E uses real signup/login helpers — keep auth enforcement on.
          NEXT_PUBLIC_SKIP_AUTH: "false",
          NEXT_PUBLIC_AUTH_BYPASS: "false",
        },
      },
});
