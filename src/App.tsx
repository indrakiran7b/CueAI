import { useEffect, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { StatusBar } from "./components/StatusBar";
import { HomeScreen } from "./screens/HomeScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { MeetingsScreen } from "./screens/MeetingsScreen";
import { KnowledgeScreen } from "./screens/KnowledgeScreen";
import { ResumeScreen } from "./screens/ResumeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { AuthScreen, type AuthMode } from "./screens/AuthScreen";
import { useAuth } from "./auth/AuthContext";
import type { TabId } from "./data/mock";

type Gate = "welcome" | "auth" | "app";

export default function App() {
  const { user, loading, logout, skipAuth } = useAuth();
  const [gate, setGate] = useState<Gate>(skipAuth ? "app" : "welcome");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [tab, setTab] = useState<TabId>("home");
  const [privacyOn, setPrivacyOn] = useState(true);
  const [consentOn, setConsentOn] = useState(true);
  const [screenContext, setScreenContext] = useState(true);
  const [overlaySession, setOverlaySession] = useState(false);
  const [autoStartOverlay, setAutoStartOverlay] = useState(false);

  useEffect(() => {
    if (skipAuth) {
      setGate("app");
      return;
    }
    if (loading) return;
    if (user) setGate("app");
    else if (gate === "app") setGate("welcome");
  }, [user, loading, gate, skipAuth]);

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setGate("auth");
  }

  function goLive(startImmediately = false) {
    setAutoStartOverlay(startImmediately);
    setTab("live");
    if (startImmediately) setOverlaySession(true);
  }

  function handleTabChange(id: TabId) {
    if (overlaySession) setOverlaySession(false);
    setAutoStartOverlay(false);
    setTab(id);
  }

  if (!skipAuth && loading) {
    return (
      <div className="app-shell">
        <div className="phone">
          <StatusBar />
          <div className="auth-screen welcome-screen">
            <p className="muted">Checking session…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!skipAuth && !user) {
    if (gate === "auth") {
      return (
        <div className="app-shell">
          <div className="phone">
            <StatusBar />
            <AuthScreen mode={authMode} onModeChange={setAuthMode} onBack={() => setGate("welcome")} />
          </div>
        </div>
      );
    }

    return (
      <div className="app-shell">
        <div className="phone">
          <StatusBar />
          <WelcomeScreen onLogin={() => openAuth("login")} onSignUp={() => openAuth("signup")} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="phone">
        <StatusBar />
        <div className="phone-body">
          {tab === "home" && <HomeScreen onNavigate={handleTabChange} onStartOverlay={() => goLive(true)} />}
          {tab === "live" && (
            <LiveScreen
              privacyOn={privacyOn}
              onPrivacyToggle={() => setPrivacyOn((v) => !v)}
              sessionActive={overlaySession}
              onSessionChange={(active) => {
                setOverlaySession(active);
                if (!active) setAutoStartOverlay(false);
              }}
              autoStart={autoStartOverlay}
              screenContext={screenContext}
            />
          )}
          {tab === "meetings" && <MeetingsScreen onNewLiveSession={() => goLive(false)} />}
          {tab === "knowledge" && <KnowledgeScreen />}
          {tab === "resume" && <ResumeScreen />}
          {tab === "settings" && (
            <SettingsScreen
              privacyOn={privacyOn}
              onPrivacyToggle={() => setPrivacyOn((v) => !v)}
              consentOn={consentOn}
              onConsentToggle={() => setConsentOn((v) => !v)}
              screenContext={screenContext}
              onScreenContextToggle={() => setScreenContext((v) => !v)}
              onBack={() => handleTabChange("home")}
              userEmail={skipAuth ? undefined : user?.email}
              userName={skipAuth ? undefined : user?.name}
              onLogout={skipAuth ? undefined : () => void logout()}
            />
          )}
        </div>
        <BottomNav active={tab} onChange={handleTabChange} />
      </div>
    </div>
  );
}
