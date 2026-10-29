"use client";

import { Suspense, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { BillingPanel } from "@/components/billing/billing-panel";
import { DesktopPreferencesPanel } from "@/components/desktop/desktop-preferences";
import { PersonalizationCard } from "@/components/settings/personalization-card";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { ThemePicker } from "@/components/settings/theme-picker";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { deleteAccountLocal } from "@/lib/auth";
import { isAdminUser } from "@/lib/app-access";
import { CUEAI_SHORTCUTS, formatShortcut } from "@/lib/shortcuts";

const SECTION_IDS = [
  "profile",
  "models",
  "privacy",
  "appearance",
  "shortcuts",
  "desktop",
  "notifications",
  "workspace",
  "billing",
  "api",
  "danger",
] as const;

export default function SettingsPage() {
  const [section, setSection] = useState("profile");
  const { theme, setTheme } = useTheme();
  const { session, refresh, logout } = useAuth();
  const admin = isAdminUser(session?.role);
  const [workspace, setWorkspace] = useState(session?.workspace || "");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [shortcutRows, setShortcutRows] = useState(() =>
    CUEAI_SHORTCUTS.map((row) => ({
      action: row.action,
      keys: formatShortcut(...row.parts),
    })),
  );
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("cueai-notif-prefs");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    setShortcutRows(
      CUEAI_SHORTCUTS.map((row) => ({
        action: row.action,
        keys: formatShortcut(...row.parts),
      })),
    );
  }, []);

  useEffect(() => {
    setWorkspace(session?.workspace || "");
  }, [session]);

  // Deep-link: /settings#billing (Upgrade button, Stripe return links)
  useEffect(() => {
    const applyHash = () => {
      const hash = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, "");
      if (!hash) return;
      const allowed = SECTION_IDS.includes(hash as (typeof SECTION_IDS)[number]);
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
    <div className="@container/settings w-full min-w-0 max-w-full">
    <div className="cue-settings-page mx-auto flex w-full min-w-0 max-w-full flex-col gap-5 animate-fade-up">
      <aside className="cue-settings-nav w-full min-w-0 shrink-0">
        <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <SettingsNav section={section} admin={admin} onSelect={selectSection} />
      </aside>

      <div className="cue-settings-panel min-w-0 flex-1 space-y-4 overflow-x-hidden">
        {section === "profile" && <ProfileSettings />}

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
          <div className="space-y-4">
          <Card className="min-w-0 space-y-4 p-4 sm:p-5">
            <div>
              <CardTitle>Mode</CardTitle>
              <p className="mt-1 text-sm text-muted">
                Light or dark. Every colour theme adapts to the mode you choose.
              </p>
            </div>
            <SegmentedControl
              label="Mode"
              value={theme}
              options={[
                { value: "dark", label: "Dark mode" },
                { value: "light", label: "Light mode" },
              ]}
              onChange={setTheme}
            />
          </Card>
          <Card className="min-w-0 space-y-4 overflow-hidden p-4 sm:p-5">
            <div>
              <CardTitle>Theme &amp; Appearance</CardTitle>
              <p className="mt-1 text-sm text-muted">
                Pick a colour theme for the whole app. Changes apply instantly and follow you when you sign in.
              </p>
            </div>
            <ThemePicker />
          </Card>
          </div>
        )}

        {section === "shortcuts" && (
          <Card className="p-6">
            <CardTitle className="mb-4">Keyboard Shortcuts</CardTitle>
            <div className="space-y-2">
              {shortcutRows.map(({ action, keys }) => (
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

        {section === "api" && <ApiKeysPanel />}

        {section === "danger" && (
          <Card className="space-y-4 border-red-500/30 p-6">
            <CardTitle className="text-red-400">Delete Account</CardTitle>
            <p className="text-sm text-muted">
              Permanently delete your CueAI account and associated data.
            </p>
            <Button variant="danger" onClick={() => void onDeleteAccount()}>
              Delete Account
            </Button>
          </Card>
        )}
      </div>
    </div>
    </div>
  );
}
