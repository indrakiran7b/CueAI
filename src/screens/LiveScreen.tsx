import { useCallback, useEffect, useRef, useState } from "react";
import {
  EyeOff,
  Layers,
  Mic,
  Play,
  Shield,
  Square,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Keyboard,
} from "lucide-react";
import {
  checkOverlayPermission,
  getOverlayStatus,
  hideOverlayForShare,
  isNativeOverlayAvailable,
  listenOverlayState,
  requestOverlayPermission,
  setOverlayPrivacy,
  showOverlay,
  startOverlay,
  stopOverlay,
  type OverlayHost,
} from "../plugins/overlay";
import { LiveSessionTools } from "../components/LiveSessionTools";

const hosts: { id: OverlayHost; label: string; tint: string }[] = [
  { id: "meet", label: "Google Meet", tint: "#00897b" },
  { id: "zoom", label: "Zoom", tint: "#0b5cff" },
  { id: "teams", label: "Teams", tint: "#5b5fc7" },
];

export function LiveScreen({
  privacyOn,
  onPrivacyToggle,
  sessionActive,
  onSessionChange,
  autoStart = false,
  screenContext = true,
}: {
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  sessionActive: boolean;
  onSessionChange: (active: boolean) => void;
  autoStart?: boolean;
  screenContext?: boolean;
}) {
  const native = isNativeOverlayAvailable();

  if (native) {
    return (
      <NativeLiveScreen
        privacyOn={privacyOn}
        onPrivacyToggle={onPrivacyToggle}
        sessionActive={sessionActive}
        onSessionChange={onSessionChange}
        autoStart={autoStart}
        screenContext={screenContext}
      />
    );
  }

  return (
    <WebLiveScreen
      privacyOn={privacyOn}
      onPrivacyToggle={onPrivacyToggle}
      sessionActive={sessionActive}
      onSessionChange={onSessionChange}
      autoStart={autoStart}
      screenContext={screenContext}
    />
  );
}

function NativeLiveScreen({
  privacyOn,
  onPrivacyToggle,
  sessionActive,
  onSessionChange,
  autoStart = false,
  screenContext = true,
}: {
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  sessionActive: boolean;
  onSessionChange: (active: boolean) => void;
  autoStart?: boolean;
  screenContext?: boolean;
}) {
  const [host, setHost] = useState<OverlayHost>("meet");
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [hiddenForShare, setHiddenForShare] = useState(false);
  const privacyRef = useRef(privacyOn);
  privacyRef.current = privacyOn;

  const refreshPermission = useCallback(async () => {
    const res = await checkOverlayPermission();
    setPermissionGranted(res.granted);
    return res.granted;
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await getOverlayStatus();
    onSessionChange(status.running);
    setMinimized(status.minimized);
    setHiddenForShare(Boolean(status.hiddenForShare));
  }, [onSessionChange]);

  useEffect(() => {
    void refreshPermission();
    void refreshStatus();

    let cancelled = false;
    let handle: { remove: () => Promise<void> } | undefined;

    void listenOverlayState((event) => {
      if (cancelled) return;
      onSessionChange(event.state === "running" || event.state === "minimized" || event.state === "hidden");
      setMinimized(event.state === "minimized");
      setHiddenForShare(event.state === "hidden" || Boolean(event.hiddenForShare));
      if (event.privacyOn !== privacyRef.current) {
        onPrivacyToggle();
      }
    }).then((h) => {
      if (!cancelled) handle = h;
      else void h.remove();
    });

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [onPrivacyToggle, onSessionChange, refreshPermission, refreshStatus]);

  useEffect(() => {
    if (!autoStart || sessionActive) return;
    void (async () => {
      const granted = await refreshPermission();
      if (!granted) return;
      setBusy(true);
      try {
        await startOverlay({ privacyOn, host });
        onSessionChange(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start overlay.");
      } finally {
        setBusy(false);
      }
    })();
  }, [autoStart, host, onSessionChange, privacyOn, refreshPermission, sessionActive]);

  async function handleGrantPermission() {
    setError(null);
    setBusy(true);
    try {
      await requestOverlayPermission();
      window.setTimeout(() => {
        void refreshPermission();
      }, 800);
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    setError(null);
    setBusy(true);
    try {
      let granted = permissionGranted;
      if (!granted) {
        const res = await requestOverlayPermission();
        granted = res.granted;
        setPermissionGranted(granted);
        if (!granted) {
          setError("Allow “Display over other apps” for CueAI, then tap Start again.");
          return;
        }
      }
      await startOverlay({ privacyOn, host });
      onSessionChange(true);
      setMinimized(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start overlay.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    setBusy(true);
    setError(null);
    try {
      await stopOverlay();
      onSessionChange(false);
      setMinimized(false);
      setHiddenForShare(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop overlay.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePrivacyToggle() {
    const next = !privacyOn;
    onPrivacyToggle();
    if (sessionActive) {
      try {
        await setOverlayPrivacy(next);
      } catch {
        // UI already toggled
      }
    }
  }

  async function handleHideForShare() {
    setBusy(true);
    setError(null);
    try {
      await hideOverlayForShare();
      setHiddenForShare(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not hide overlay.");
    } finally {
      setBusy(false);
    }
  }

  async function handleShowOverlay() {
    setBusy(true);
    setError(null);
    try {
      await showOverlay();
      setHiddenForShare(false);
      setMinimized(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not show overlay.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LiveControlPanel
      host={host}
      onHostChange={setHost}
      privacyOn={privacyOn}
      onPrivacyToggle={() => void handlePrivacyToggle()}
      sessionActive={sessionActive}
      minimized={minimized}
      hiddenForShare={hiddenForShare}
      permissionGranted={permissionGranted}
      onGrantPermission={() => void handleGrantPermission()}
      busy={busy}
      error={error}
      onStart={() => void handleStart()}
      onStop={() => void handleStop()}
      onHideForShare={() => void handleHideForShare()}
      onShowOverlay={() => void handleShowOverlay()}
      onRefresh={() => void refreshStatus()}
      browserPreview={false}
      screenContext={screenContext}
    />
  );
}

/** Browser: same APK Live control panel UI (no fake Meet simulation). */
function WebLiveScreen({
  privacyOn,
  onPrivacyToggle,
  sessionActive,
  onSessionChange,
  autoStart = false,
  screenContext = true,
}: {
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  sessionActive: boolean;
  onSessionChange: (active: boolean) => void;
  autoStart?: boolean;
  screenContext?: boolean;
}) {
  const [host, setHost] = useState<OverlayHost>("meet");
  const [busy, setBusy] = useState(false);
  const [hiddenForShare, setHiddenForShare] = useState(false);

  useEffect(() => {
    if (autoStart && !sessionActive) onSessionChange(true);
  }, [autoStart, sessionActive, onSessionChange]);

  function handleStart() {
    setBusy(true);
    window.setTimeout(() => {
      setHiddenForShare(false);
      onSessionChange(true);
      setBusy(false);
    }, 350);
  }

  function handleStop() {
    setHiddenForShare(false);
    onSessionChange(false);
  }

  return (
    <LiveControlPanel
      host={host}
      onHostChange={setHost}
      privacyOn={privacyOn}
      onPrivacyToggle={onPrivacyToggle}
      sessionActive={sessionActive}
      minimized={false}
      hiddenForShare={hiddenForShare}
      permissionGranted
      busy={busy}
      error={null}
      onStart={handleStart}
      onStop={handleStop}
      onHideForShare={() => setHiddenForShare(true)}
      onShowOverlay={() => setHiddenForShare(false)}
      browserPreview
      screenContext={screenContext}
    />
  );
}

function LiveControlPanel({
  host,
  onHostChange,
  privacyOn,
  onPrivacyToggle,
  sessionActive,
  minimized,
  hiddenForShare,
  permissionGranted,
  onGrantPermission,
  busy,
  error,
  onStart,
  onStop,
  onHideForShare,
  onShowOverlay,
  onRefresh,
  browserPreview,
  screenContext = true,
}: {
  host: OverlayHost;
  onHostChange: (host: OverlayHost) => void;
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  sessionActive: boolean;
  minimized: boolean;
  hiddenForShare: boolean;
  permissionGranted: boolean;
  onGrantPermission?: () => void;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onHideForShare: () => void;
  onShowOverlay: () => void;
  onRefresh?: () => void;
  browserPreview?: boolean;
  screenContext?: boolean;
}) {
  const hostMeta = hosts.find((h) => h.id === host)!;

  if (sessionActive) {
    return (
      <div className="screen section-gap fade-in live-launcher" style={{ paddingBottom: 110 }}>
        <div style={{ paddingTop: 4 }}>
          <p className="eyebrow">System overlay</p>
          <h1 className="h1">
            {hiddenForShare ? "Hidden from screen share." : "Overlay running over other apps."}
          </h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {hiddenForShare
              ? "CueAI is off the display while you present, so Meet entire-screen share stays clear. Open the notification and tap Peek for a quick glance."
              : `CueAI is floating above ${hostMeta.label}. With Privacy on, it auto-hides when Android detects screen sharing.`}
          </p>
        </div>

        <div className={`card section-gap status-card${minimized || hiddenForShare ? " minimized" : ""}`}>
          <div className="row space-between">
            <span className="chip">
              <span className="live-dot" />
              {hiddenForShare ? "Hidden from share" : minimized ? "Minimized to bubble" : "Overlay active"}
            </span>
            <span className="chip neutral">{hostMeta.label}</span>
          </div>
          <div className="overlay-preview-mini">
            <div className="overlay-preview-header">
              <strong>CueAI</strong>
              <span>{hiddenForShare ? "Invisible to Meet" : "Overlay · drag to move"}</span>
              <span className={`chip${privacyOn ? "" : " warn-chip"}`} style={{ marginLeft: "auto" }}>
                {privacyOn ? "Private" : "Visible"}
              </span>
            </div>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {privacyOn
                ? "Privacy: auto-hide during entire-screen share (no black Meet screen)."
                : "Privacy off — entire-screen share may show CueAI."}
            </p>
          </div>
        </div>

        <div className="card section-gap">
          <div className="row space-between">
            <div className="row">
              <Shield size={16} color="var(--teal-bright)" />
              <strong style={{ fontSize: 13 }}>Presenter Privacy Mode</strong>
            </div>
            <button type="button" className={`toggle${privacyOn ? " on" : ""}`} onClick={onPrivacyToggle} />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Android can’t keep an overlay visible to you and invisible in entire-screen capture. Privacy
            mode hides CueAI from the display while sharing so others see your screen — not CueAI and not
            a black frame.
          </p>
        </div>

        {error && <p className="auth-error">{error}</p>}

        <LiveSessionTools
          host={host}
          privacyOn={privacyOn}
          hiddenForShare={hiddenForShare}
          screenContext={screenContext}
          sessionActive={sessionActive}
          onHideForShare={onHideForShare}
          onShowOverlay={onShowOverlay}
        />

        {!hiddenForShare && privacyOn && (
          <button type="button" className="btn btn-teal-outline" style={{ width: "100%" }} disabled={busy} onClick={onHideForShare}>
            <EyeOff size={16} />
            Hide for screen share now
          </button>
        )}

        {hiddenForShare && (
          <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={busy} onClick={onShowOverlay}>
            <Play size={16} />
            Show overlay again
          </button>
        )}

        {onRefresh && (
          <button type="button" className="btn btn-ghost" style={{ width: "100%" }} disabled={busy} onClick={onRefresh}>
            <ExternalLink size={16} />
            Refresh overlay status
          </button>
        )}

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", background: "linear-gradient(135deg,#f87171,#b91c1c)", color: "#fff", boxShadow: "none" }}
          disabled={busy}
          onClick={onStop}
        >
          <Square size={16} />
          Stop overlay
        </button>

        {browserPreview && (
          <p className="muted" style={{ fontSize: 12, textAlign: "center", margin: 0 }}>
            Browser preview of the APK Live controls. Install the APK for a real system overlay.
          </p>
        )}

        <style>{liveCss}</style>
      </div>
    );
  }

  return (
    <div className="screen section-gap fade-in live-launcher" style={{ paddingBottom: 110 }}>
      <div style={{ paddingTop: 4 }}>
        <p className="eyebrow">System overlay</p>
        <h1 className="h1">Start a floating CueAI window.</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          CueAI opens as its own system window over Meet, Zoom, Teams, and other apps — not inside the
          meeting UI — so Presenter Privacy Mode can keep it out of screen share.
        </p>
      </div>

      <div className="card section-gap">
        <strong style={{ fontSize: 13 }}>Overlay on top of</strong>
        <div className="host-picker">
          {hosts.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`host-chip${host === h.id ? " active" : ""}`}
              onClick={() => onHostChange(h.id)}
            >
              <span className="host-dot" style={{ background: h.tint }} />
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card section-gap">
        <div className="row space-between">
          <div className="row">
            <Shield size={16} color="var(--teal-bright)" />
            <strong style={{ fontSize: 13 }}>Presenter Privacy Mode</strong>
          </div>
          <button type="button" className={`toggle${privacyOn ? " on" : ""}`} onClick={onPrivacyToggle} />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          When Privacy is on, CueAI auto-hides during entire-screen share so others see your screen —
          not the assistant and not a black Meet frame. Tap “Hide for screen share now” before presenting
          if needed.
        </p>
      </div>

      <ul className="perm-list">
        <li>
          {permissionGranted ? <CheckCircle2 size={14} color="var(--success)" /> : <AlertCircle size={14} color="var(--warn)" />}
          <Layers size={14} /> Display over other apps
          {!permissionGranted && onGrantPermission && (
            <button type="button" className="auth-link" style={{ marginLeft: "auto" }} onClick={onGrantPermission}>
              Grant
            </button>
          )}
        </li>
        <li>
          <Mic size={14} /> Microphone · mock live transcription when session runs
        </li>
        <li>
          <EyeOff size={14} /> Auto-hide during entire-screen share
        </li>
        <li>
          <Keyboard size={14} /> Hotkeys Ctrl/⌘+H hide · Ctrl/⌘+Shift+H show
        </li>
      </ul>

      {error && <p className="auth-error">{error}</p>}

      <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={busy} onClick={onStart}>
        <Play size={16} />
        {busy ? "Starting…" : "Start overlay window"}
      </button>

      <p className="muted" style={{ fontSize: 12, textAlign: "center", margin: 0 }}>
        {browserPreview
          ? `Browser preview — after start you’ll see the same controls as the APK. Open ${hostMeta.label} on device with the APK for a real overlay.`
          : `After start, CueAI moves to the background so you can open ${hostMeta.label}.`}
      </p>

      <style>{liveCss}</style>
    </div>
  );
}

const liveCss = `
  .live-launcher .host-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .host-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(0,0,0,0.22);
    border: 1px solid var(--border);
    font-weight: 600;
    font-size: 13px;
    text-align: left;
  }
  .host-chip.active {
    border-color: var(--border-strong);
    background: var(--teal-soft);
    color: var(--teal-bright);
  }
  .host-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .perm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .perm-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--text-muted);
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }
  .status-card.minimized {
    border-color: rgba(251, 191, 36, 0.35);
  }
  .overlay-preview-mini {
    border-radius: 14px;
    border: 1px solid var(--border);
    background: rgba(0,0,0,0.28);
    padding: 10px 12px;
  }
  .overlay-preview-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .overlay-preview-header strong {
    font-family: var(--font-display);
  }
  .overlay-preview-header span:nth-child(2) {
    color: var(--text-dim);
    font-size: 11px;
  }
  .warn-chip {
    background: rgba(248, 113, 113, 0.15) !important;
    color: #fecaca !important;
    border-color: rgba(248, 113, 113, 0.35) !important;
  }
  .live-suggest {
    margin: 0;
    white-space: pre-wrap;
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
    max-height: 160px;
    overflow: auto;
  }
  .live-ask-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
`;
