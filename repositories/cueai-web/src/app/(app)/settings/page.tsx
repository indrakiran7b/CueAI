"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
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
import { AiProvidersPanel } from "@/components/settings/ai-providers-panel";
import { ThemePicker } from "@/components/settings/theme-picker";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { deleteAccountLocal } from "@/lib/auth";
import { isAdminUser } from "@/lib/app-access";
import { CUEAI_SHORTCUTS, formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

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
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [shortcutRows, setShortcutRows] = useState(() =>
    CUEAI_SHORTCUTS.map((row) => ({
      action: row.action,
      keys: formatShortcut(...row.parts),
    })),
  );
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
      setSaveMsg({ ok: false, text: "Workspace name is required." });
      return;
    }
    if (savingWorkspace) return;
    setSavingWorkspace(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/workspace", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; workspace?: { name?: string } };
      if (!res.ok) {
        setSaveMsg({ ok: false, text: data.error || "Unable to update workspace." });
        return;
      }
      await refresh();
      setWorkspace(data.workspace?.name || nextName);
      setSaveMsg({ ok: true, text: "Workspace updated." });
    } catch {
      setSaveMsg({ ok: false, text: "Unable to update workspace." });
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function onDeleteAccount() {
    if (!window.confirm("Sign out and clear the CueAI account details cached in this browser? Your server account is not deleted.")) return;
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

        {section === "models" && <AiProvidersPanel />}

        {section === "privacy" && (
          <Card className="space-y-4 p-6">
            <CardTitle>Privacy</CardTitle>
            <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
              <p className="font-medium">Data retention</p>
              <p className="mt-1 text-muted">
                Retention periods and automatic deletion are set per workspace by admins.
              </p>
              {admin && (
                <Link href="/admin" className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
                  Open Admin Portal
                </Link>
              )}
            </div>
            <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
              <p className="font-medium">Knowledge Base search</p>
              <p className="mt-1 text-muted">
                Whether documents are searched semantically or by keywords depends on the server configuration.
              </p>
              <button
                type="button"
                onClick={() => selectSection("models")}
                className="mt-2 text-primary underline-offset-4 hover:underline"
              >
                See AI Providers &amp; Models
              </button>
            </div>
            <p className="text-xs text-muted">
              Recording storage, Screen Context defaults and analytics sharing cannot be changed here yet, so no
              switches are shown for them.
            </p>
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
              In-app notifications appear under the bell in the top bar. Email and push notifications are not
              available yet, so there is nothing to configure here.
            </CardDescription>
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
            <Button variant="primary" loading={savingWorkspace} disabled={savingWorkspace} onClick={() => void saveWorkspace()}>
              Update workspace
            </Button>
            {saveMsg && section === "workspace" && (
              <p role={saveMsg.ok ? "status" : "alert"} className={cn("text-xs", saveMsg.ok ? "text-teal-300" : "text-red-400")}>
                {saveMsg.text}
              </p>
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
              Accounts and their workspace data are deleted by a workspace admin in Admin Portal → Users. This page
              cannot delete your server account.
            </p>
            <p className="text-sm text-muted">
              You can sign out and remove the account details cached in this browser.
            </p>
            <Button variant="danger" onClick={() => void onDeleteAccount()}>
              Sign out and clear this device
            </Button>
          </Card>
        )}
      </div>
    </div>
    </div>
  );
}
