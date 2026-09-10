import { Capacitor } from "@capacitor/core";

/** True inside Capacitor Android/iOS WebView (not the desktop browser prototype). */
export function isNativeShell() {
  try {
    if (Capacitor.isNativePlatform()) return true;
    const platform = Capacitor.getPlatform();
    if (platform === "android" || platform === "ios") return true;
  } catch {
    // ignore
  }
  if (typeof window !== "undefined" && "Capacitor" in window) return true;
  // Android WebView user-agent marker
  if (typeof navigator !== "undefined" && /; wv\)/i.test(navigator.userAgent)) return true;
  return false;
}

/**
 * Fake phone-frame status bar for the desktop web prototype only.
 * Never render on APK — the real Android status bar is already there.
 */
export function StatusBar() {
  if (isNativeShell()) {
    return <div className="status-bar-native-spacer" aria-hidden />;
  }

  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="status-bar status-bar-prototype">
      <span>{time}</span>
      <div className="icons" aria-hidden>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.55a11 11 0 0114.08 0" />
          <path d="M1.42 9a16 16 0 0121.16 0" />
          <path d="M8.53 16.11a6 6 0 016.95 0" />
          <circle cx="12" cy="20" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 17h2v-4H2v4zm4 0h2V9H6v8zm4 0h2V7h-2v10zm4 0h2V4h-2v13zm4 0h2v-6h-2v6z" />
        </svg>
        <svg width="20" height="12" viewBox="0 0 28 14" fill="none">
          <rect x="0.5" y="0.5" width="22" height="13" rx="3" stroke="currentColor" />
          <rect x="2.5" y="2.5" width="16" height="9" rx="1.5" fill="currentColor" />
          <path d="M24 4.5v5a2.5 2.5 0 000-5z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
