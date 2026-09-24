import fs from "node:fs";
import path from "node:path";

/** Workspace store + client config live under userData/workspace-data. */
export function workspaceDataDir(userData: string): string {
  return path.join(userData, "workspace-data");
}

export function workspaceEnvPath(userData: string): string {
  return path.join(workspaceDataDir(userData), ".env");
}

/** Parse KEY=VALUE lines from the workspace .env file (no quotes required). */
export function readWorkspaceEnvFile(userData: string): Record<string, string> {
  const file = workspaceEnvPath(userData);
  const loaded: Record<string, string> = {};
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return loaded;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) loaded[key] = value;
  }
  return loaded;
}

/** Workspace file overrides process.env (same rule as embedded web server). */
export function resolveWorkspaceEnv(userData: string, key: string): string {
  const fromFile = readWorkspaceEnvFile(userData)[key]?.trim();
  if (fromFile) return fromFile.includes("\\n") ? fromFile.replace(/\\n/g, "\n") : fromFile;
  const fromProcess = process.env[key]?.trim() || "";
  return fromProcess.includes("\\n") ? fromProcess.replace(/\\n/g, "\n") : fromProcess;
}
