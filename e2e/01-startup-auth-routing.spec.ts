import { test, expect } from "@playwright/test";
import { signupAndLogin, uniqueUser } from "./helpers/auth";

const APP_ROUTES = [
  "/dashboard",
  "/meetings",
  "/meetings/live",
  "/meetings/summary",
  "/resume",
  "/knowledge",
  "/translation",
  "/screen-context",
  "/companion",
  "/settings",
];

test.describe("E2E Flow 1 — Application startup", () => {
  test("landing page loads without fatal errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in|log in|get started/i }).first()).toBeVisible();

    const critical = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("hydration")
    );
    expect(critical).toEqual([]);
  });

  test("login and signup pages render", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back|sign in/i }).first()).toBeVisible();

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create|start|sign up/i }).first()).toBeVisible();
  });
});

test.describe("E2E Flow 2–4 — Auth and routing", () => {
  test("signup, dashboard access, logout, protected redirect", async ({ page }) => {
    const user = uniqueUser("routes");
    await signupAndLogin(page, user);

    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();

    for (const route of APP_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).not.toContainText("Application error");
      if (route === "/admin") {
        await expect(page).toHaveURL(/dashboard/);
      }
    }

    await page.request.post("/api/auth/logout");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/signup/);
  });

  test("invalid login shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("invalid@cueai.test");
    await page.getByLabel(/password/i).fill("wrongpass");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/invalid|incorrect|failed|not found/i)).toBeVisible();
  });
});

test.describe("E2E Flow 3 — Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signupAndLogin(page, uniqueUser("nav"));
  });

  test("sidebar links navigate correctly", async ({ page }) => {
    const links = [
      { label: "Meetings", url: "/meetings" },
      { label: "Live Session", url: "/meetings/live" },
      { label: "Knowledge Base", url: "/knowledge" },
      { label: "Translation", url: "/translation" },
      { label: "Settings", url: "/settings" },
    ];

    for (const link of links) {
      await page.getByRole("link", { name: link.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(link.url.replace("/", "\\/")));
    }
  });
});
