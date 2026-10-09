import { envFlag, isCueaiProduction } from "@/lib/runtime-env";

/** Well-known local pair — used only when bootstrap is explicitly enabled in non-production. */
export const DEV_ONLY_BOOTSTRAP_EMAIL = "admin@cueai.local";
export const DEV_ONLY_BOOTSTRAP_PASSWORD = "admin123";

export type BootstrapAdminSpec = {
  email: string;
  password: string;
  name: string;
};

function bootstrapEnabled(): boolean {
  return envFlag(process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED);
}

export function isBootstrapAdminEnabled(): boolean {
  return bootstrapEnabled();
}

export function configuredBootstrapEmail(): string {
  return (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
}

function configuredBootstrapPassword(): string {
  return process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
}

export function isDefaultBootstrapPair(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === DEV_ONLY_BOOTSTRAP_EMAIL &&
    password === DEV_ONLY_BOOTSTRAP_PASSWORD
  );
}

/**
 * Resolve the first-admin identity for a brand-new store.
 * Returns null when bootstrap is disabled (production default).
 */
export function resolveBootstrapAdmin(): BootstrapAdminSpec | null {
  if (!bootstrapEnabled()) return null;

  const email = configuredBootstrapEmail() || DEV_ONLY_BOOTSTRAP_EMAIL;
  const password = configuredBootstrapPassword() || DEV_ONLY_BOOTSTRAP_PASSWORD;

  if (isCueaiProduction()) {
    if (!configuredBootstrapEmail() || !configuredBootstrapPassword()) {
      throw new Error(
        "CUEAI_BOOTSTRAP_ADMIN_ENABLED in production requires BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.",
      );
    }
    if (isDefaultBootstrapPair(email, password)) {
      throw new Error(
        "Production cannot start with the default development bootstrap credentials.",
      );
    }
    if (password.length < 8) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.");
    }
  }

  return {
    email,
    password,
    name: "Workspace Admin",
  };
}

export function isBootstrapAdminEmail(email?: string | null): boolean {
  const value = (email || "").trim().toLowerCase();
  if (!value) return false;
  const configured = configuredBootstrapEmail();
  if (configured) return value === configured;
  return value === DEV_ONLY_BOOTSTRAP_EMAIL;
}
