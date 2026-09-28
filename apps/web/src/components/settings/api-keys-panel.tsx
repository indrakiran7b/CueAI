"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, MoreHorizontal, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Capability = "rag" | "live_session" | "general_ai";

type ProviderOption = {
  type: string;
  name: string;
  endpoint?: string;
  defaultModels: string[];
};

type CatalogModel = {
  id: string;
  name: string;
  providerType: string | null;
  capability: string;
  enabled: boolean;
};

type ApiKeyItem = {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  model: string;
  maskedKey: string;
  status: string;
  capabilities: Capability[];
  endpoint?: string;
  isDefault: boolean;
  isActive?: boolean;
};

const PROVIDERS_WITH_ENDPOINT = new Set([
  "openai",
  "openrouter",
  "deepseek",
  "perplexity",
]);
const PROVIDERS_WITH_ORG = new Set(["openai"]);

function modelsFor(
  providerType: string,
  providers: ProviderOption[],
  catalogModels: CatalogModel[],
): string[] {
  if (!providerType) return [];
  const fromCatalog = catalogModels
    .filter((m) => m.providerType === providerType)
    .map((m) => m.name);
  const fromDefaults =
    providers.find((p) => p.type === providerType)?.defaultModels || [];
  return [...new Set([...fromDefaults, ...fromCatalog])];
}

export function ApiKeysPanel() {
  const [items, setItems] = useState<ApiKeyItem[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showUseExisting, setShowUseExisting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [provider, setProvider] = useState("");
  const [keyName, setKeyName] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [organizationId, setOrganizationId] = useState("");

  const [useProvider, setUseProvider] = useState("");
  const [useKeyId, setUseKeyId] = useState("");
  const [useModel, setUseModel] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/settings/api-keys", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as {
      items?: ApiKeyItem[];
      providers?: ProviderOption[];
      models?: CatalogModel[];
    };
    if (!res.ok) throw new Error("Failed to load API keys.");
    setItems(body.items || []);
    setProviders(body.providers || []);
    setCatalogModels(body.models || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          await refresh();
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load.");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const modelsForProvider = useMemo(
    () => modelsFor(provider, providers, catalogModels),
    [provider, providers, catalogModels],
  );

  const useModels = useMemo(
    () => modelsFor(useProvider, providers, catalogModels),
    [useProvider, providers, catalogModels],
  );

  const keysForUseProvider = useMemo(
    () => (useProvider ? items.filter((i) => i.provider === useProvider) : items),
    [items, useProvider],
  );

  const providersWithKeys = useMemo(() => {
    const types = new Set(items.map((i) => i.provider));
    return providers.filter((p) => types.has(p.type));
  }, [items, providers]);

  useEffect(() => {
    if (!modelsForProvider.length) {
      setModel("");
      return;
    }
    if (!modelsForProvider.includes(model)) {
      setModel(modelsForProvider[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, modelsForProvider.join("|")]);

  useEffect(() => {
    if (!useModels.length) {
      setUseModel("");
      return;
    }
    if (!useModels.includes(useModel)) {
      const selected = items.find((i) => i.id === useKeyId);
      setUseModel(
        selected && useModels.includes(selected.model)
          ? selected.model
          : useModels[0] || "",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useProvider, useKeyId, useModels.join("|")]);

  function openCreate() {
    const first = providers[0]?.type || "openai";
    const label = providers.find((p) => p.type === first)?.name || "Provider";
    setEditId(null);
    setProvider(first);
    setKeyName(`My ${label} Key`);
    setApiKey("");
    setShowKey(false);
    setEndpoint(providers.find((p) => p.type === first)?.endpoint || "");
    setOrganizationId("");
    setShowCreate(true);
    setShowUseExisting(false);
    setMenuOpenId(null);
    setError(null);
    setMessage(null);
  }

  function openUseExisting() {
    if (!items.length) return;
    const active = items.find((i) => i.isActive ?? i.isDefault) || items[0];
    setUseProvider(active?.provider || providersWithKeys[0]?.type || "");
    setUseKeyId(active?.id || "");
    setUseModel(active?.model || "");
    setShowUseExisting(true);
    setShowCreate(false);
    setMenuOpenId(null);
    setError(null);
    setMessage(null);
  }

  function resetForm() {
    setApiKey("");
    setShowKey(false);
    setKeyName("");
    setEndpoint("");
    setOrganizationId("");
    setEditId(null);
    setShowCreate(false);
  }

  function resetUseExisting() {
    setUseProvider("");
    setUseKeyId("");
    setUseModel("");
    setShowUseExisting(false);
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!provider) throw new Error("Select a provider.");
      if (!model.trim()) throw new Error("Select an LLM model.");
      if (!keyName.trim()) throw new Error("Enter a key name.");
      if (!editId && !apiKey.trim()) throw new Error("Enter an API key.");

      const res = await fetch(
        editId
          ? `/api/settings/api-keys/${encodeURIComponent(editId)}`
          : "/api/settings/api-keys",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            name: keyName.trim(),
            model: model.trim(),
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
            ...(PROVIDERS_WITH_ENDPOINT.has(provider)
              ? { endpoint: endpoint.trim() || undefined }
              : {}),
            ...(PROVIDERS_WITH_ORG.has(provider)
              ? { organizationId: organizationId.trim() || undefined }
              : {}),
            capabilities: ["rag", "live_session", "general_ai"],
            isDefault:
              items.length === 0 ||
              Boolean(editId && items.find((i) => i.id === editId)?.isDefault),
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string } | string;
      };
      if (!res.ok) {
        const msg =
          typeof body.error === "string"
            ? body.error
            : body.error?.message || "Unable to save API key.";
        throw new Error(msg);
      }
      setMessage(editId ? "API key updated." : "API key saved.");
      resetForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
      setApiKey("");
    }
  }

  async function onUseExistingKey() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!useKeyId) throw new Error("Select an API key.");
      if (!useModel.trim()) throw new Error("Select an LLM model.");

      const selected = items.find((i) => i.id === useKeyId);
      if (!selected) throw new Error("Selected API key was not found.");

      if (selected.model !== useModel.trim()) {
        const patchRes = await fetch(
          `/api/settings/api-keys/${encodeURIComponent(useKeyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: useModel.trim() }),
          },
        );
        if (!patchRes.ok) {
          const body = (await patchRes.json().catch(() => ({}))) as {
            error?: { message?: string } | string;
          };
          const msg =
            typeof body.error === "string"
              ? body.error
              : body.error?.message || "Could not update model.";
          throw new Error(msg);
        }
      }

      const res = await fetch(
        `/api/settings/api-keys/${encodeURIComponent(useKeyId)}/default`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Could not activate the selected key.");

      setMessage("Active key updated. AI requests will use this configuration.");
      resetUseExisting();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use selected key.");
    } finally {
      setBusy(false);
    }
  }

  async function onSetActive(id: string) {
    setBusy(true);
    setMenuOpenId(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/settings/api-keys/${encodeURIComponent(id)}/default`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Could not set active key.");
      setMessage("Active key updated. AI requests will use this configuration.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set active key.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setMenuOpenId(null);
    if (
      !window.confirm(
        "Delete API Key?\n\nThis will permanently remove this credential.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed.");
      setMessage("API key deleted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: ApiKeyItem) {
    setEditId(item.id);
    setProvider(item.provider);
    setKeyName(item.name);
    setModel(item.model);
    setApiKey("");
    setShowKey(false);
    setEndpoint(
      item.endpoint ||
        providers.find((p) => p.type === item.provider)?.endpoint ||
        "",
    );
    setOrganizationId("");
    setShowCreate(true);
    setShowUseExisting(false);
    setMenuOpenId(null);
    setMessage(null);
    setError(null);
  }

  const headerActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={items.length === 0 || busy}
        title={
          items.length === 0 ? "No existing API keys available" : "Use an existing API key"
        }
        onClick={openUseExisting}
      >
        Use Existing Key
      </Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="shrink-0"
        disabled={busy}
        onClick={openCreate}
      >
        <Plus className="h-3.5 w-3.5" />
        Create New Key
      </Button>
    </div>
  );

  if (loading) {
    return <Card className="p-6 text-sm text-muted">Loading API keys…</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>API Keys</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Add your own LLM provider API keys and use them securely with CueAI.
              Keys are encrypted and never displayed in full.
            </p>
          </div>
          {headerActions}
        </div>

        {(message || error) && (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              error
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-teal-500/30 bg-teal-500/10 text-teal-100",
            )}
          >
            {error || message}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-sm text-muted">No API keys yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const active = item.isActive ?? item.isDefault;
              return (
                <div
                  key={item.id}
                  className="relative rounded-xl border border-[var(--border)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.providerLabel}</p>
                        <Badge variant={active ? "success" : "default"}>
                          {active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted">{item.name}</p>
                      <p className="text-xs text-subtle">Model: {item.model}</p>
                      <p className="font-mono text-xs text-subtle">{item.maskedKey}</p>
                    </div>
                    <div className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Key actions"
                        disabled={busy}
                        onClick={() =>
                          setMenuOpenId((id) => (id === item.id ? null : item.id))
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                      {menuOpenId === item.id && (
                        <div className="absolute right-0 z-20 mt-1 min-w-[140px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                          {!active && (
                            <button
                              type="button"
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                              onClick={() => void onSetActive(item.id)}
                            >
                              Set Active
                            </button>
                          )}
                          <button
                            type="button"
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                            onClick={() => startEdit(item)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-[var(--surface-hover)]"
                            onClick={() => void onDelete(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {showUseExisting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="relative w-full max-w-md space-y-4 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Use Existing API Key</CardTitle>
              <button
                type="button"
                className="rounded-lg p-1 text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
                aria-label="Close"
                onClick={resetUseExisting}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-subtle">
              Choose a saved credential and model. CueAI will use it for AI requests
              without showing the secret.
            </p>

            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">Select Provider</span>
              <select
                value={useProvider}
                onChange={(e) => {
                  const next = e.target.value;
                  setUseProvider(next);
                  const first = items.find((i) => i.provider === next);
                  setUseKeyId(first?.id || "");
                  setUseModel(first?.model || "");
                }}
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Select Provider</option>
                {providersWithKeys.map((p) => (
                  <option key={p.type} value={p.type}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">Select API Key</span>
              <select
                value={useKeyId}
                disabled={!useProvider || keysForUseProvider.length === 0}
                onChange={(e) => {
                  const id = e.target.value;
                  setUseKeyId(id);
                  const selected = items.find((i) => i.id === id);
                  if (selected) setUseModel(selected.model);
                }}
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Select existing key</option>
                {keysForUseProvider.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.providerLabel} · {item.maskedKey}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">LLM Model</span>
              <select
                value={useModel}
                disabled={!useProvider || useModels.length === 0}
                onChange={(e) => setUseModel(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Select Model</option>
                {useModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={resetUseExisting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={busy}
                onClick={() => void onUseExistingKey()}
              >
                Use Key
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="relative w-full max-w-md space-y-4 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <CardTitle>{editId ? "Edit API Key" : "Create New API Key"}</CardTitle>
              <button
                type="button"
                className="rounded-lg p-1 text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
                aria-label="Close"
                onClick={resetForm}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-subtle">
              Your API key is encrypted and securely stored by CueAI. It is never
              displayed again after saving.
            </p>

            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">Provider</span>
              <select
                value={provider}
                disabled={Boolean(editId)}
                onChange={(e) => {
                  const next = e.target.value;
                  setProvider(next);
                  const p = providers.find((x) => x.type === next);
                  const label = p?.name || "Provider";
                  if (!keyName.trim() || keyName.startsWith("My ")) {
                    setKeyName(`My ${label} Key`);
                  }
                  setEndpoint(p?.endpoint || "");
                }}
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Select Provider</option>
                {providers.map((p) => (
                  <option key={p.type} value={p.type}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">LLM Model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!provider || modelsForProvider.length === 0}
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Select Model</option>
                {modelsForProvider.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">
                API Key{editId ? " (leave blank to keep existing)" : ""}
              </span>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={editId ? "Enter new API key" : "Enter API key"}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">Key Name</span>
              <Input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="My OpenAI Key"
                autoComplete="off"
              />
            </label>

            {provider &&
              (PROVIDERS_WITH_ENDPOINT.has(provider) || PROVIDERS_WITH_ORG.has(provider)) && (
                <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                  <p className="text-sm font-medium">API Key Details</p>
                  {PROVIDERS_WITH_ENDPOINT.has(provider) && (
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-subtle">Base URL / Endpoint</span>
                      <Input
                        value={endpoint}
                        onChange={(e) => setEndpoint(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        autoComplete="off"
                      />
                    </label>
                  )}
                  {PROVIDERS_WITH_ORG.has(provider) && (
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-subtle">
                        Organization ID (optional)
                      </span>
                      <Input
                        value={organizationId}
                        onChange={(e) => setOrganizationId(e.target.value)}
                        placeholder="org_…"
                        autoComplete="off"
                      />
                    </label>
                  )}
                </div>
              )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={resetForm}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={busy}
                onClick={() => void onSave()}
              >
                Save Key
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
