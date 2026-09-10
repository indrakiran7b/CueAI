import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Building2, EyeOff, Lock, Mic, Monitor, Sparkles, Users } from "lucide-react";
import { aiProviderLabel, isRemoteAiConfigured } from "../ai/client";
import {
  loadActiveWorkspaceId,
  loadAiProvider,
  loadWorkspaces,
  saveActiveWorkspaceId,
  saveAiProvider,
  saveWorkspaces,
  type AiProviderId,
  type Workspace,
} from "../lib/workspaces";

export function SettingsScreen({
  privacyOn,
  onPrivacyToggle,
  consentOn,
  onConsentToggle,
  screenContext,
  onScreenContextToggle,
  onBack,
  userEmail,
  userName,
  onLogout,
}: {
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  consentOn: boolean;
  onConsentToggle: () => void;
  screenContext: boolean;
  onScreenContextToggle: () => void;
  onBack?: () => void;
  userEmail?: string;
  userName?: string;
  onLogout?: () => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaces());
  const [activeId, setActiveId] = useState(() => loadActiveWorkspaceId(loadWorkspaces()));
  const [newName, setNewName] = useState("");
  const [invite, setInvite] = useState("");
  const [audioOnDevice, setAudioOnDevice] = useState(true);
  const [provider, setProvider] = useState<AiProviderId>(() => loadAiProvider());
  const active = useMemo(() => workspaces.find((w) => w.id === activeId) ?? workspaces[0], [workspaces, activeId]);

  function selectWorkspace(id: string) {
    setActiveId(id);
    saveActiveWorkspaceId(id);
  }

  function addWorkspace() {
    const name = newName.trim();
    if (!name) return;
    const ws: Workspace = { id: `w-${Date.now()}`, name, role: "Admin", members: 1 };
    const next = [ws, ...workspaces];
    setWorkspaces(next);
    saveWorkspaces(next);
    selectWorkspace(ws.id);
    setNewName("");
  }

  function inviteMember() {
    if (!invite.trim() || !active) return;
    const next = workspaces.map((w) => (w.id === active.id ? { ...w, members: w.members + 1 } : w));
    setWorkspaces(next);
    saveWorkspaces(next);
    setInvite("");
  }

  function changeProvider(id: AiProviderId) {
    setProvider(id);
    saveAiProvider(id);
  }

  return (
    <div className="screen section-gap fade-in" style={{ paddingBottom: 110 }}>
      <div style={{ paddingTop: 4 }}>
        {onBack && (
          <button type="button" className="chip neutral" onClick={onBack} style={{ marginBottom: 10 }}>
            <ArrowLeft size={12} />
            Back
          </button>
        )}
        <p className="eyebrow">Privacy & safety</p>
        <h1 className="h1">Professional by design.</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          CueAI is a meeting, sales, support, and career assistant — not cheating or deception software.
        </p>
      </div>

      {(userEmail || userName) && (
        <div className="card section-gap">
          <h2 className="h2">Account</h2>
          {userName && <p style={{ margin: 0, fontWeight: 600 }}>{userName}</p>}
          {userEmail && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {userEmail}
            </p>
          )}
          {onLogout && (
            <button type="button" className="btn btn-teal-outline" style={{ width: "100%" }} onClick={onLogout}>
              Log out
            </button>
          )}
        </div>
      )}

      <div className="card section-gap">
        <div className="row" style={{ gap: 8 }}>
          <Building2 size={16} color="var(--teal-bright)" />
          <h2 className="h2" style={{ margin: 0 }}>
            Workspace management
          </h2>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Active: <strong style={{ color: "var(--text)" }}>{active?.name}</strong> · {active?.role} (saved locally)
        </p>
        <div className="ws-list">
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`ws-row${w.id === activeId ? " active" : ""}`}
              onClick={() => selectWorkspace(w.id)}
            >
              <div className="grow">
                <strong style={{ fontSize: 13 }}>{w.name}</strong>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: 11 }}>
                  {w.role} · {w.members} members
                </p>
              </div>
              <Users size={14} color="var(--text-dim)" />
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="field grow"
            placeholder="New workspace name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="button" className="btn btn-teal-outline" onClick={addWorkspace}>
            Add
          </button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="field grow"
            placeholder="Invite email (mock)"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
          <button type="button" className="btn btn-ghost" onClick={inviteMember}>
            Invite
          </button>
        </div>
      </div>

      <div className="card section-gap">
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={16} color="var(--teal-bright)" />
          <h2 className="h2" style={{ margin: 0 }}>
            AI provider
          </h2>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {(
            [
              ["mock", "Mock"],
              ["grok", "Grok"],
              ["openai", "OpenAI"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip${provider === id ? "" : " neutral"}`}
              onClick={() => changeProvider(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {aiProviderLabel()}
        </p>
        <span className={`chip${isRemoteAiConfigured() ? "" : " neutral"}`}>
          {isRemoteAiConfigured() ? "Remote connected" : "Responses mocked locally"}
        </span>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Provider chips are demo preferences. Set <code>VITE_AI_API_URL</code> for a real backend later.
        </p>
      </div>

      <div className="card warn-card row" style={{ alignItems: "flex-start", gap: 12 }}>
        <AlertTriangle size={18} color="var(--warn)" style={{ marginTop: 2 }} />
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Always inform participants when transcription or AI assistance is active. Follow your company’s consent policy.
        </p>
      </div>

      <SettingRow
        icon={<EyeOff size={18} color="var(--teal-bright)" />}
        title="Presenter Privacy Mode"
        desc="Hide CueAI overlay from screen share and recordings."
        on={privacyOn}
        onToggle={onPrivacyToggle}
      />
      <SettingRow
        icon={<Mic size={18} color="var(--teal-bright)" />}
        title="Meeting consent banner"
        desc="Show a notice that CueAI is assisting you."
        on={consentOn}
        onToggle={onConsentToggle}
      />
      <SettingRow
        icon={<Monitor size={18} color="var(--teal-bright)" />}
        title="Visual screen context"
        desc="Allow OCR/vision cues from your screen during Live."
        on={screenContext}
        onToggle={onScreenContextToggle}
      />
      <SettingRow
        icon={<Lock size={18} color="var(--teal-bright)" />}
        title="Keep audio on-device first"
        desc="Prefer local processing before cloud AI providers."
        on={audioOnDevice}
        onToggle={() => setAudioOnDevice((v) => !v)}
      />

      <div className="card section-gap">
        <h2 className="h2">Responsible usage</h2>
        <ul className="rules">
          <li>Do not use CueAI to deceive interviewers or exams.</li>
          <li>Do not bypass employer monitoring or academic integrity rules.</li>
          <li>Use Resume Tailor to highlight true experience only.</li>
        </ul>
      </div>

      <style>{`
        .warn-card {
          border-color: rgba(251, 191, 36, 0.35);
          background: rgba(251, 191, 36, 0.08);
        }
        .setting-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border-radius: 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          width: 100%;
          text-align: left;
        }
        .rules {
          margin: 0;
          padding-left: 18px;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.55;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ws-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ws-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: rgba(0,0,0,0.18);
          text-align: left;
          width: 100%;
        }
        .ws-row.active {
          border-color: var(--border-strong);
          background: var(--teal-soft);
        }
      `}</style>
    </div>
  );
}

function SettingRow({
  icon,
  title,
  desc,
  on,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="setting-row" onClick={onToggle}>
      {icon}
      <div className="grow">
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
          {desc}
        </p>
      </div>
      <span className={`toggle${on ? " on" : ""}`} aria-hidden />
    </button>
  );
}
