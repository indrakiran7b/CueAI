import { expect, type APIRequestContext, type Page } from "@playwright/test";

export type TestUser = {
  name: string;
  email: string;
  password: string;
  workspace: string;
};

export function uniqueUser(prefix = "e2e"): TestUser {
  const stamp = Date.now();
  return {
    name: "E2E Tester",
    email: `${prefix}-${stamp}@cueai.test`,
    password: "testpass123",
    workspace: "E2E Workspace",
  };
}

export async function signupAndLogin(page: Page, user: TestUser) {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      name: user.name,
      email: user.email,
      password: user.password,
      workspace: user.workspace,
    },
  });
  if (!signup.ok()) {
    throw new Error(`Signup failed: ${signup.status()} ${await signup.text()}`);
  }

  const login = await page.request.post("/api/auth/login", {
    data: { email: user.email, password: user.password },
  });
  if (!login.ok()) {
    throw new Error(`Login failed: ${login.status()} ${await login.text()}`);
  }

  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
}

export async function logout(page: Page) {
  await page.request.post("/api/auth/logout");
  await page.evaluate(() => {
    localStorage.removeItem("cueai-session");
    localStorage.removeItem("cueai-users");
  });
}

export async function apiMe(request: APIRequestContext) {
  const res = await request.get("/api/auth/me");
  return res.json();
}
