import { app, BrowserWindow, screen, shell } from "electron";
import path from "node:path";
import { getStoreValue, setStoreValue } from "../services/store";
import { getWebOrigin, waitForWebServer } from "../services/web-server";
import { getLicenseService } from "../services/license-service";
import { consumeAllowWindowClose, isAppQuitting } from "../services/app-lifecycle";
import {
  installMacContextMenu,
  macMainWindowOptions,
} from "../platform/macos";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function workspaceErrorHtml(target: string, detail: string) {
  const safeTarget = escapeHtml(target);
  const safeDetail = escapeHtml(detail);
  const jsTarget = JSON.stringify(target);
  const technical = app.isPackaged
    ? ""
    : `<p style="color:#a1a1aa;line-height:1.5;max-width:460px;margin-top:16px;font-size:13px">Development: ${safeDetail}</p>
        <p style="color:#f5f5f7;margin-top:20px">Start the workspace, then Retry:</p>
        <pre style="background:#141414;border-radius:12px;padding:14px 16px;margin-top:10px;color:#0099ff">npm run dev:mac</pre>`;
  return `<!doctype html><html><body style="margin:0;background:#090909;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
      <div style="padding:88px 48px 48px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#86868b">CueAI for Mac</p>
        <h1 style="font-size:28px;letter-spacing:-.03em;margin:0 0 12px">CueAI could not connect to the workspace.</h1>
        <p style="color:#a1a1aa;line-height:1.5;max-width:460px">Couldn’t open <code>${safeTarget}</code>.</p>
        ${technical}
        <div style="margin-top:28px;display:flex;gap:12px">
          <button id="retry" style="background:#0099ff;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer">Retry</button>
          <button id="close" style="background:#1d1d1f;color:#f5f5f7;border:0;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer">Close</button>
        </div>
      </div>
      <script>
        document.getElementById("retry").onclick = function () {
          location.replace(${jsTarget});
        };
        document.getElementById("close").onclick = function () {
          window.close();
        };
      </script>
    </body></html>`;
}

function showWorkspaceError(win: BrowserWindow, target: string, detail: string) {
  if (win.isDestroyed()) return;
  console.error("[ELECTRON] Renderer failed", detail);
  void win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(workspaceErrorHtml(target, detail))}`
  );
  if (!win.isVisible()) {
    win.show();
    win.focus();
  }
}

async function loadRenderer(win: BrowserWindow, target: string) {
  const origin = getWebOrigin().replace(/\/$/, "");
  console.log("[ELECTRON] Renderer URL:", target);
  console.log("[WEB] Waiting for web server");
  try {
    await waitForWebServer(origin, 15000);
    console.log("[WEB] Web server ready");
    if (win.isDestroyed()) return;
    console.log("[ELECTRON] Loading renderer");
    await win.loadURL(target);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    showWorkspaceError(win, target, detail);
  }
}

export function createMainWindow(): BrowserWindow {
  const saved = getStoreValue("mainBounds");
  const display = screen.getPrimaryDisplay().workArea;
  const isMac = process.platform === "darwin";

  const win = new BrowserWindow(
    macMainWindowOptions({
      width: saved?.width ?? Math.min(1280, display.width),
      height: saved?.height ?? Math.min(820, display.height),
      x: saved?.x,
      y: saved?.y,
      minWidth: 960,
      minHeight: 640,
      show: false,
      title: "CueAI",
      autoHideMenuBar: !isMac,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: true,
      },
    })
  );

  win.setTitle("CueAI");
  if (process.platform === "darwin") {
    win.setWindowButtonVisibility(false);
  }
  win.webContents.on("console-message", (_event, _level, message) => {
    if (message.startsWith("[DEVICE]") || message.startsWith("[AUTH]")) {
      console.log(message);
    }
  });
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    if (!win.isDestroyed()) win.setTitle("CueAI");
  });

  if (isMac) installMacContextMenu(win);

  const origin = getWebOrigin().replace(/\/$/, "");
  const initialPath = getLicenseService().resolveInitialPath();
  const target = `${origin}${initialPath.startsWith("/") ? initialPath : `/${initialPath}`}`;

  win.webContents.on("did-start-loading", () => {
    const url = win.webContents.getURL();
    if (!url.startsWith("data:")) console.log("[ELECTRON] Loading renderer");
  });
  win.webContents.on("did-finish-load", () => {
    const url = win.webContents.getURL();
    if (!url.startsWith("data:")) console.log("[ELECTRON] Renderer loaded");
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[ELECTRON] Renderer process gone", details.reason, details.exitCode);
  });
  win.webContents.on("unresponsive", () => {
    console.warn("[ELECTRON] Renderer unresponsive");
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || win.isDestroyed()) return;
    if (code === -3) return; // ERR_ABORTED from an intentional navigation
    if ((url || "").startsWith("data:")) return;
    console.error("[ELECTRON] Renderer failed", desc || "Connection refused", `(${code})`, url || target);
    showWorkspaceError(
      win,
      url || target,
      `${desc || "Connection refused"} (${code}). Start the web app, then Retry.`
    );
  });

  void loadRenderer(win, target);

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  win.on("close", (e) => {
    if (!win.isDestroyed()) {
      setStoreValue("mainBounds", win.getBounds());
    }
    if (isAppQuitting() || consumeAllowWindowClose()) return;
    e.preventDefault();
    win.hide();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}
