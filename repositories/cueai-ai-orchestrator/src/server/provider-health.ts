/**
 * In-process record of real AI calls per provider (server-side only).
 * Holds no keys, prompts or provider error text: only provider, model, feature, time and an error code.
 * Resets when the server restarts; persisted usage events cover the features that record them.
 */

export type ProviderCallRecord = {
  provider: string;
  model: string;
  feature: string;
  at: string;
};

export type ProviderHealth = {
  lastSuccess?: ProviderCallRecord;
  lastFailure?: ProviderCallRecord & { code: string };
};

type HealthMap = Map<string, ProviderHealth>;

const KEY = Symbol.for("cueai.providerHealth");

function map(): HealthMap {
  const g = globalThis as typeof globalThis & { [KEY]?: HealthMap };
  if (!g[KEY]) g[KEY] = new Map();
  return g[KEY]!;
}

export function recordProviderSuccess(provider: string, model: string, feature: string): void {
  const entry = map().get(provider) ?? {};
  entry.lastSuccess = { provider, model, feature, at: new Date().toISOString() };
  map().set(provider, entry);
}

export function recordProviderFailure(provider: string, model: string, feature: string, code: string): void {
  if (code === "cancelled") return;
  const entry = map().get(provider) ?? {};
  entry.lastFailure = { provider, model, feature, code, at: new Date().toISOString() };
  map().set(provider, entry);
}

export function providerHealthSnapshot(): Record<string, ProviderHealth> {
  return Object.fromEntries([...map().entries()].map(([k, v]) => [k, { ...v }]));
}

export function resetProviderHealth(): void {
  map().clear();
}
