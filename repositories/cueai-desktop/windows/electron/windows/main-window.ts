import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";
import { getStoreValue, setStoreValue } from "../services/store";
import { getWebOrigin } from "../services/web-server";
import { isAppQuitting } from "../services/app-lifecycle";

export function createMainWindow(): BrowserWindow {
  const saved = getStoreValue("mainBounds");
  const display = screen.getPrimaryDisplay().workArea;

  const win = new BrowserWindow({
    width: saved?.width ?? Math.min(1440, display.width),
    height: saved?.height ?? Math.min(900, display.height),
    x: saved?.x,
    y: saved?.y,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#090909",
    roundedCorners: true,
    hasShadow: true,
    thickFrame: true,
    autoHideMenuBar: true,
    title: "CueAI",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  const origin = getWebOrigin().replace(/\/$/, "");
  const target = `${origin}/dashboard`;
  void win.loadURL(target);

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  // Avoid a silent black window when Next.js (:3000) isn't running in dev.
  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || win.isDestroyed()) return;
    const html = `<!doctype html><html><body style="margin:0;background:#0B0F10;color:#e5e7eb;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
      <div style="max-width:520px;padding:24px">
        <h1 style="font-size:20px;margin:0 0 8px">CueAI can't load the app UI</h1>
        <p style="color:#9ca3af;line-height:1.5;margin:0 0 12px">Failed to open <code style="color:#2dd4bf">${url || target}</code></p>
        <p style="color:#9ca3af;line-height:1.5;margin:0 0 12px">${desc || "Connection refused"} (code ${code})</p>
        <p style="color:#d1d5db;line-height:1.5;margin:0">In development, start the web app first:</p>
        <pre style="background:#111827;padding:12px;border-radius:8px;margin-top:8px;color:#2dd4bf">npm run dev:web</pre>
        <p style="color:#9ca3af;margin-top:12px">Then keep <code>npm run dev:desktop</code> running and relaunch.</p>
      </div></body></html>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  });

  // Closing the main shell must NOT tear down the companion overlay process.
  // Always hide unless the app is explicitly quitting (tray Quit / before-quit).
  win.on("close", (e) => {
    if (!win.isDestroyed()) {
      setStoreValue("mainBounds", win.getBounds());
    }
    if (isAppQuitting()) return;
    e.preventDefault();
    win.hide();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}
