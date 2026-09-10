import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { isNativeShell } from "./components/StatusBar";

if (isNativeShell()) {
  document.documentElement.classList.add("native-app");
  document.body.classList.add("native-app");
}

async function configureNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: "#090909" });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // StatusBar plugin unavailable in some previews
  }
}

void configureNativeChrome();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
