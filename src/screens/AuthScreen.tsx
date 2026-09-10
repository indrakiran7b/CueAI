import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { CueLogo } from "../components/CueLogo";
import { useAuth } from "../auth/AuthContext";
import { authConfig } from "../auth/config";
import { AuthError } from "../auth/keycloak";

export type AuthMode = "login" | "signup";

export function AuthScreen({
  mode,
  onModeChange,
  onBack,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onBack: () => void;
}) {
  const { login, register, loginWithGoogle, loginWithApple, forgotPassword, error: authError, clearError } =
    useAuth();
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [updatesOptIn, setUpdatesOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  function resetFormNoise() {
    setError(null);
    clearError();
    setPassword("");
    setConfirmPassword("");
  }

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    resetFormNoise();
    onModeChange(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    clearError();

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    if (!isLogin) {
      if (!fullName.trim()) {
        setError("Enter your full name.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register({ email, password, fullName });
      }
    } catch (err) {
      setError(err instanceof AuthError || err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSocial(provider: "google" | "apple") {
    setError(null);
    clearError();
    setSubmitting(true);
    try {
      if (provider === "google") await loginWithGoogle();
      else await loginWithApple();
    } catch (err) {
      setError(err instanceof AuthError || err instanceof Error ? err.message : "Social login failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen auth-form-screen fade-in">
      <header className="auth-top">
        <button type="button" className="auth-back" onClick={onBack} aria-label="Back to welcome">
          <ChevronLeft size={22} />
        </button>
        <div className="brand-mark" style={{ fontSize: 16 }}>
          <span className="logo">
            <CueLogo size={14} />
          </span>
          CueAI
        </div>
        <span className="auth-top-spacer" />
      </header>

      <div className="auth-segment" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          role="tab"
          aria-selected={isLogin}
          className={isLogin ? "active" : undefined}
          onClick={() => switchMode("login")}
        >
          Login
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLogin}
          className={!isLogin ? "active" : undefined}
          onClick={() => switchMode("signup")}
        >
          Sign up
        </button>
      </div>

      <div className="auth-copy">
        <h1 className="h1">{isLogin ? "Welcome back" : "Create your CueAI account"}</h1>
        <p className="muted">
          {isLogin
            ? "Log in to continue to your meeting copilot."
            : "Start with meetings, live assist, knowledge, and resume tailor."}
        </p>
      </div>

      <div className="auth-social">
        <button type="button" className="btn btn-social" disabled={submitting} onClick={() => handleSocial("google")}>
          <GoogleGlyph />
          {isLogin ? "Continue with Google" : "Sign up with Google"}
          {!authConfig.googleEnabled && <span className="social-hint">setup</span>}
        </button>
        <button type="button" className="btn btn-social" disabled={submitting} onClick={() => handleSocial("apple")}>
          <AppleGlyph />
          {isLogin ? "Continue with Apple" : "Sign up with Apple"}
          {!authConfig.appleEnabled && <span className="social-hint">setup</span>}
        </button>
      </div>

      <div className="auth-divider">
        <span>or continue with email</span>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {!isLogin && (
          <label className="field-label">
            Full name
            <input
              className="field"
              type="text"
              autoComplete="name"
              placeholder="Alex Chen"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
        )}

        <label className="field-label">
          {isLogin ? "Email" : "Work email"}
          <input
            className="field"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field-label">
          Password
          <div className="field-password">
            <input
              className="field"
              type={showPassword ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="field-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {!isLogin && (
          <label className="field-label">
            Confirm password
            <div className="field-password">
              <input
                className="field"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="field-eye"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
        )}

        {!isLogin && (
          <label className="auth-checkbox">
            <input type="checkbox" checked={updatesOptIn} onChange={(e) => setUpdatesOptIn(e.target.checked)} />
            <span>Send me product updates</span>
          </label>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
          {submitting ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </button>

        {isLogin && (
          <div className="auth-row-links">
            <button type="button" className="auth-link" onClick={forgotPassword}>
              Forgot password?
            </button>
          </div>
        )}
      </form>

      <p className="auth-switch">
        {isLogin ? (
          <>
            Don&apos;t have an account?{" "}
            <button type="button" className="auth-link" onClick={() => switchMode("signup")}>
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" className="auth-link" onClick={() => switchMode("login")}>
              Log in
            </button>
          </>
        )}
      </p>

      <p className="auth-consent">By continuing you agree to CueAI&apos;s Terms and Privacy Policy.</p>
      {isLogin && (
        <p className="auth-demo-hint">Demo: demo@cueai.dev / Demo1234!</p>
      )}
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
