"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { ProviderStatusReport } from "@/lib/server/ai-provider-status";
import { modelsInUse, type ModelGroup } from "@/lib/ai-models-in-use";

async function fetchProviderStatus(): Promise<{ report: ProviderStatusReport } | { error: string }> {
  const fallback = "Could not load the AI model configuration.";
  try {
    const res = await fetch("/api/settings/ai-providers", { credentials: "include", cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as ProviderStatusReport & { error?: string };
    return res.ok ? { report: data } : { error: data.error || fallback };
  } catch {
    return { error: fallback };
  }
}

/** Settings → AI Providers & Models. Read-only: the server chooses providers. */
export function AiProvidersPanel() {
  const [groups, setGroups] = useState<ModelGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((result: { report: ProviderStatusReport } | { error: string }) => {
    if ("report" in result) {
      setGroups(modelsInUse(result.report));
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchProviderStatus().then(apply);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchProviderStatus().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const anyServed = groups?.some((g) => g.models.some((m) => m.served));

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <CardTitle>AI Models in Use</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-busy={loading}>
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      {!groups && loading && <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-active)]" />}
      {groups && groups.length === 0 && <p className="text-sm text-muted">No AI models are configured.</p>}
      {groups && groups.length > 0 && (
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.provider} className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">{g.provider}</h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {g.models.map((m) => (
                  <li key={m.id}>
                    <code
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-active)] px-1.5 py-0.5 font-mono text-xs"
                      title={m.served ? "Has served a real request" : "Configured, no request recorded yet"}
                    >
                      {m.served && <Check className="h-3 w-3 text-[var(--success-fg)]" aria-label="served" />}
                      {m.id}
                    </code>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {anyServed && (
        <p className="flex items-center gap-1 text-xs text-subtle">
          <Check className="h-3 w-3" aria-hidden /> has served a real request; others are configured but not yet used.
        </p>
      )}
    </Card>
  );
}
