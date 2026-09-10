import { CueLogo } from "../components/CueLogo";

export function WelcomeScreen({
  onLogin,
  onSignUp,
}: {
  onLogin: () => void;
  onSignUp: () => void;
}) {
  return (
    <div className="auth-screen welcome-screen fade-in">
      <div className="welcome-glow" aria-hidden />

      <div className="welcome-hero">
        <div className="welcome-mark">
          <CueLogo size={36} tone="dark" />
        </div>
        <h1 className="welcome-brand">CueAI</h1>
        <p className="welcome-tagline">Your real-time meeting copilot.</p>
        <p className="welcome-sub">
          Live answers, screen context, meetings, knowledge, and resume tailor.
        </p>
      </div>

      <div className="welcome-actions">
        <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={onLogin}>
          Log in
        </button>
        <button type="button" className="btn btn-teal-outline" style={{ width: "100%" }} onClick={onSignUp}>
          Create account
        </button>

        <div className="welcome-social-preview" aria-label="Sign in options">
          <span className="social-icon-pill" title="Google">
            <GoogleGlyph />
          </span>
          <span className="social-icon-pill" title="Apple">
            <AppleGlyph />
          </span>
        </div>
      </div>

      <p className="welcome-footer">Consent-first · Presenter Privacy Mode · Not for deception use</p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.3 14.7 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1 8.4.7 1 1.5 2.2 2.6 2.1 1 0 1.4-.7 2.7-.7s1.6.7 2.7.7c1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.1-.8-2.2-3.6zM14.5 6.5c.6-.7 1-1.7.9-2.7-.9.1-1.9.6-2.5 1.3-.6.6-1.1 1.6-1 2.6 1 .1 1.9-.5 2.6-1.2z" />
    </svg>
  );
}
