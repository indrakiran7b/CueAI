"use client";

import { Suspense, useEffect, useState } from "react";
import {
  Bell,
  CreditCard,
  Keyboard,
  KeyRound,
  Monitor,
  Palette,
  Shield,
  Sparkles,
  Trash2,
  User,
  Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { BillingPanel } from "@/components/billing/billing-panel";
import { DesktopPreferencesPanel } from "@/components/desktop/desktop-preferences";
import { LicensePanel } from "@/components/desktop/license-panel";
import { PersonalizationCard } from "@/components/settings/personalization-card";
import { deleteAccountLocal, updateSessionProfile } from "@/lib/auth";
import { isAdminUser } from "@/lib/app-access";
import { cn } from "@/lib/utils";

const sections = [
  { id: "profile", label: "Profile", icon: User },
  { id: "models", label: "AI Models", icon: Sparkles },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "desktop", label: "Desktop Preferences", icon: Monitor },
  { id: "license", label: "License", icon: KeyRound },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "api", label: "API Keys", icon: KeyRound },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
];

export default function SettingsPage() {
  const [section, setSection] = useState("profile");
  const { theme, setTheme } = useTheme();
  const { session, refresh, logout } = useAuth();
  const admin = isAdminUser(session?.role);
  const visibleSections = sections.filter((item) => admin || item.id !== "workspace");
  const [name, setName] = useState(session?.name || "");
  const [email, setEmail] = useState(session?.email || "");
  const [role, setRole] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("cueai-role") || "" : ""
  );
  const [workspace, setWorkspace] = useState(session?.workspace || "");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("cueai-notif-prefs");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [storedApiKey, setStoredApiKey] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("cueai-api-key") : null
  );
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  useEffect(() => {
    setName(session?.name || "");
    setEmail(session?.email || "");
    setWorkspace(session?.workspace || "");
  }, [session]);

  // Deep-link: /settings#billing (Upgrade button, Stripe return links)
  useEffect(() => {
    const applyHash = () => {
      const hash = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, "");
      if (!hash) return;
      const allowed = sections.some((s) => s.id === hash);
      if (!allowed) return;
      window.setTimeout(() => setSection(hash), 0);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    if (!admin && section === "workspace") setSection("profile");
  }, [admin, section]);

  function selectSection(id: string) {
    setSection(id);
    if (typeof window !== "undefined") {
      const next = id === "profile" ? "/settings" : `/settings#${id}`;
      window.history.replaceState(null, "", next);
    }
  }

  function saveProfile() {
    updateSessionProfile({ name, email });
    if (role.trim()) localStorage.setItem("cueai-role", role.trim());
    void refresh();
    setSaveMsg("Profile saved.");
  }

  async function saveWorkspace() {
    const nextName = workspace.trim();
    if (!nextName) {
      setSaveMsg("Workspace name is required.");
      return;
    }
    try {
      const res = await fetch("/api/admin/workspace", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; workspace?: { name?: string } };
      if (!res.ok) {
        setSaveMsg(data.error || "Unable to update workspace.");
        return;
      }
      await refresh();
      setWorkspace(data.workspace?.name || nextName);
      setSaveMsg("Workspace updated.");
    } catch {
      setSaveMsg("Unable to update workspace.");
    }
  }

  async function onDeleteAccount() {
    if (!window.confirm("Delete this local CueAI account and session?")) return;
    deleteAccountLocal();
    await logout();
    window.location.href = "/signup";
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 animate-fade-up lg:flex-row">
      <aside className="w-full shrink-0 lg:w-56">
        <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight lg:mb-6">
          Settings
        </h1>
        <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSection(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                section === s.id
                  ? "bg-[var(--primary-muted)] text-primary"
                  : "text-muted hover:bg-[var(--surface-hover)] hover:text-foreground",
                s.id === "danger" && section !== s.id && "text-red-400/80"
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        {section === "profile" && (
          <Card className="space-y-4 p-6">
            <CardHeader>
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Your public workspace identity</CardDescription>
              </div>
            </CardHeader>
            <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
            <Input
              label="Role"
              placeholder="Your role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <Button variant="primary" onClick={saveProfile}>
              Save changes
            </Button>
            {saveMsg && section === "profile" && (
              <p className="text-xs text-teal-300">{saveMsg}</p>
            )}
          </Card>
        )}

        {section === "profile" && <PersonalizationCard />}

        {section === "models" && (
          <Card className="space-y-4 p-6">
            <CardTitle>AI Models</CardTitle>
            {[
              { name: "CueAI Fast", desc: "Lowest latency for live answers", tag: "Default" },
              { name: "CueAI Reason", desc: "Deeper reasoning for summaries", tag: null },
              { name: "Private endpoint", desc: "Enterprise VPC model", tag: "Enterprise" },
            ].map((m) => (
              <label
                key={m.name}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-4 hover:bg-[var(--surface-hover)]"
              >
                <input
                  type="radio"
                  name="model"
                  defaultChecked={m.tag === "Default"}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{m.name}</p>
                    {m.tag && <Badge variant="info">{m.tag}</Badge>}
                  </div>
                  <p className="text-sm text-muted">{m.desc}</p>
                </div>
              </label>
            ))}
          </Card>
        )}

        {section === "privacy" && (
          <Card className="space-y-4 p-6">
            <CardTitle>Privacy</CardTitle>
            {[
              "Store meeting recordings",
              "Allow Screen Context by default",
              "Share anonymized analytics",
              "Index knowledge base for semantic search",
            ].map((label, i) => (
              <label
                key={label}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
              >
                {label}
                <input type="checkbox" defaultChecked={i !== 1} className="rounded" />
              </label>
            ))}
          </Card>
        )}

        {section === "appearance" && (
          <Card className="space-y-4 p-6">
            <CardTitle>Appearance</CardTitle>
            <p className="text-sm text-muted">Theme preference for CueAI</p>
            <div className="grid grid-cols-2 gap-3">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    theme === t
                      ? "border-teal-500/40 bg-[var(--primary-muted)]"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]"
                  )}
                >
                  <div
                    className={cn(
                      "mb-3 h-16 rounded-xl border border-[var(--border)]",
                      t === "dark" ? "bg-[#09090b]" : "bg-[#f8fafc]"
                    )}
                  />
                  <p className="text-sm font-medium capitalize">{t} mode</p>
                </button>
              ))}
            </div>
          </Card>
        )}

        {section === "shortcuts" && (
          <Card className="p-6">
            <CardTitle className="mb-4">Keyboard Shortcuts</CardTitle>
            <div className="space-y-2">
              {[
                ["Toggle Companion", "⌘⇧Space"],
                ["Settings", "⌘,"],
                ["Command palette", "⌘K"],
                ["Close window", "⌘W"],
                ["Minimize", "⌘M"],
                ["Ask / primary action", "⌘↩"],
              ].map(([action, keys]) => (
                <div
                  key={action}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
                >
                  <span className="text-muted">{action}</span>
                  <kbd className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-xs">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          </Card>
        )}

        {section === "desktop" && <DesktopPreferencesPanel />}

        {section === "license" && <LicensePanel />}

        {section === "notifications" && (
          <Card className="space-y-3 p-6">
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Preferences are stored on this device only. Push/email delivery is
              not connected yet.
            </CardDescription>
            {[
              "Summary ready",
              "Action item due",
              "Knowledge re-index complete",
              "Billing alerts",
            ].map((l) => (
              <label
                key={l}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
              >
                {l}
                <input
                  type="checkbox"
                  className="rounded"
                  checked={notifPrefs[l] ?? false}
                  onChange={(e) => {
                    const next = { ...notifPrefs, [l]: e.target.checked };
                    setNotifPrefs(next);
                    localStorage.setItem("cueai-notif-prefs", JSON.stringify(next));
                  }}
                />
              </label>
            ))}
          </Card>
        )}

        {section === "workspace" && (
          <Card className="space-y-4 p-6">
            <CardTitle>Workspace</CardTitle>
            <Input
              label="Workspace name"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            />
            <Input
              label="Slug"
              value={workspace
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || "workspace"}
              readOnly
            />
            <Button variant="primary" onClick={() => void saveWorkspace()}>
              Update workspace
            </Button>
            {saveMsg && section === "workspace" && (
              <p className="text-xs text-teal-300">{saveMsg}</p>
            )}
          </Card>
        )}

        {section === "billing" && (
          <Suspense
            fallback={
              <Card className="p-6 text-sm text-muted">Loading billing…</Card>
            }
          >
            <BillingPanel compact />
          </Suspense>
        )}

        {section === "api" && (
          <Card className="space-y-4 p-6">
            <CardTitle>API Keys</CardTitle>
            <p className="text-sm text-muted">
              Public developer API keys are not issued by CueAI yet. Any key
              stored here stays on this device only and is not a real server
              credential.
            </p>
            {storedApiKey ? (
              <>
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
                  <code className="font-mono text-xs text-muted">
                    {apiKeyVisible
                      ? storedApiKey
                      : `${storedApiKey.slice(0, 10)}••••••••`}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setApiKeyVisible((v) => !v)}
                  >
                    {apiKeyVisible ? "Hide" : "Reveal"}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    localStorage.removeItem("cueai-api-key");
                    setStoredApiKey(null);
                    setApiKeyVisible(false);
                    setSaveMsg("Local key cleared.");
                  }}
                >
                  Clear local key
                </Button>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-muted">
                No API keys yet.
              </p>
            )}
          </Card>
        )}

        {section === "danger" && (
          <Card className="space-y-4 border-red-500/30 p-6">
            <CardTitle className="text-red-400">Danger Zone</CardTitle>
            <p className="text-sm text-muted">
              Permanently delete your local CueAI account and session data.
            </p>
            <Button variant="danger" onClick={() => void onDeleteAccount()}>
              Delete account
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
