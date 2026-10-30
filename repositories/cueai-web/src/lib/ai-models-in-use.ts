import type { ProviderStatusReport } from "@/lib/server/ai-provider-status";

export type ModelGroup = { provider: string; models: { id: string; served: boolean }[] };

/**
 * Providers with the model IDs CueAI routes to, from the provider-status report. `served` is true
 * only when a feature's last real request was answered by that provider and model.
 */
export function modelsInUse(report: Pick<ProviderStatusReport, "providers" | "features">): ModelGroup[] {
  const served = new Set(
    report.features.flatMap((f) => (f.lastServed ? [`${f.lastServed.provider}|${f.lastServed.model}`] : [])),
  );
  return report.providers
    .filter((p) => p.models.length > 0)
    .map((p) => ({
      provider: p.name,
      models: p.models.map((m) => ({ id: m.id, served: served.has(`${p.name}|${m.id}`) })),
    }));
}
