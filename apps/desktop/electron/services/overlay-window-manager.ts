/**
 * Centralized overlay BrowserWindow lifecycle — single source of truth.
 */

import { app, BrowserWindow, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { CompanionMode } from "../ipc/channels";
import { getStoreValue, setStoreValue } from "./store";
import {
  COMPANION_MIN_HEIGHT,
  COMPANION_MIN_WIDTH,
  clampBoundsToWorkArea,
  defaultCompanionBounds,
  COMPANION_DEFAULT_HEIGHT,
  COMPANION_MENU_HEIGHT,
  expandedCompanionBounds,
  getMaxBoundsForDisplay,
  isValidPersistedBounds,
  sanitizeBounds,
  type Bounds,
} from "./companion-bounds";
import {
  applyCaptureExclusion,
  bindScreenShareController,
  dockPresenterToEdge,
  getMeetingSession,
} from "./screen-share";

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

let overlayWin: BrowserWindow | null = null;
let allowQuit = false;
let visibilityEpoch = 0;
let hideTimer: NodeJS.Timeout | null = null;
let companionLoadError: string | null = null;
let explicitShowGraceUntil = 0;
let persistTimer: NodeJS.Timeout | null = null;
let showPromise: Promise<void> | null = null;
let displayMetricsBound = false;

let resizeSession: {
  dir: ResizeDirection;
  startBounds: Bounds;
  startCursor: { x: number; y: number };
} | null = null;
let resizeInterval: ReturnType<typeof setInterval> | null = null;

function log(tag: string, msg: string) {
  if (!app.isPackaged) console.log(`[${tag}] ${msg}`);
}

let companionLoadTarget: string | null = null;
let companionDevFallbackAttempted = false;

function getCompanionDevUrl() {
  const port = process.env.CUEAI_COMPANION_DEV_PORT ?? "15174";
  return `http://127.0.0.1:${port}/`;
}

function resolveBundledCompanionPath(): string | null {
  const candidates = [
    path.join(__dirname, "../../dist/index.html"),
    path.join(app.getAppPath(), "dist", "index.html"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadCompanionUrl(win: BrowserWindow) {
  const bundled = resolveBundledCompanionPath();

  // Packaged app: always use the built overlay.
  // Dev: always use Vite so source changes (including accents) show up.
  // Stale apps/desktop/dist must not override the redesign.
  if (app.isPackaged) {
    if (!bundled) {
      showCompanionLoadError(
        win,
        path.join(app.getAppPath(), "dist", "index.html"),
        "Bundled companion UI is missing. Reinstall CueAI.",
        -1
      );
      return;
    }
    companionLoadTarget = bundled;
    companionDevFallbackAttempted = false;
    void win.loadFile(bundled);
    return;
  }

  companionLoadTarget = getCompanionDevUrl();
  companionDevFallbackAttempted = false;
  void win.loadURL(companionLoadTarget);
}

function showCompanionLoadError(win: BrowserWindow, url: string, desc: string, code: number) {
  companionLoadError = desc || `Load failed (${code})`;
  const hint = app.isPackaged
    ? "Try reinstalling CueAI, or contact support with the error above."
    : `<pre style="background:#111827;padding:10px;border-radius:8px;color:#e5e7eb;font-size:12px;margin:8px 0 0">npm run dev:desktop</pre>
      <p style="color:#9ca3af;font-size:12px;margin:8px 0 0">Keep that terminal open so the companion UI can load on port 15174.</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:rgba(11,15,16,0.92);color:#e5e7eb;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
    <div style="max-width:420px;padding:20px;border:1px solid rgba(255,255,255,0.12);border-radius:16px">
      <h1 style="font-size:16px;margin:0 0 8px;color:#f4f4f5">Companion UI failed to load</h1>
      <p style="color:#9ca3af;font-size:13px">Could not open ${url}</p>
      <p style="color:#9ca3af;font-size:13px">${companionLoadError}</p>
      ${hint}
    </div></body></html>`;
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

export type CompanionBridgeStatus = {
  visible: boolean;
  bounds: Bounds | null;
  loadError: string | null;
  url: string | null;
  mode: CompanionMode;
  expanded: boolean;
};

export type CompanionWindowState = {
  bounds: Bounds;
  expanded: boolean;
  mode: CompanionMode;
};

export function isOverlayAvailable() {
  return Boolean(overlayWin && !overlayWin.isDestroyed());
}

export function getCompanionWindow() {
  return overlayWin;
}

export function getCompanionBridgeStatus(): CompanionBridgeStatus {
  const win = overlayWin;
  return {
    visible: Boolean(win && !win.isDestroyed() && win.isVisible()),
    bounds: win && !win.isDestroyed() ? win.getBounds() : null,
    loadError: companionLoadError,
    url: win && !win.isDestroyed() ? win.webContents.getURL() : null,
    mode: getStoreValue("companionMode"),
    expanded: getStoreValue("companionExpanded"),
  };
}

export function getCompanionWindowState(): CompanionWindowState | null {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return null;
  return {
    bounds: win.getBounds(),
    expanded: getStoreValue("companionExpanded"),
    mode: getStoreValue("companionMode"),
  };
}

export function allowCompanionQuit() {
  allowQuit = true;
}

function applyWindowConstraints(win: BrowserWindow) {
  const display = screen.getDisplayMatching(win.getBounds()).workArea;
  const max = getMaxBoundsForDisplay(display);
  win.setMinimumSize(COMPANION_MIN_WIDTH, COMPANION_MIN_HEIGHT);
  win.setMaximumSize(max.width, max.height);
  win.setResizable(true);
}

function resolveInitialBounds(): Bounds {
  const saved = getStoreValue("companionBounds");
  const expanded = getStoreValue("companionExpanded");
  const defaults = defaultCompanionBounds();

  if (isValidPersistedBounds(saved) && expanded) {
    const clamped = clampBoundsToWorkArea(saved);
    log("BOUNDS", `Restored expanded bounds ${clamped.width}x${clamped.height}`);
    return clamped;
  }

  // Idle overlay is a compact bar. Ignore older tall persisted panels.
  if (isValidPersistedBounds(saved) && !expanded) {
    const compact = clampBoundsToWorkArea({
      ...saved,
      width: Math.max(saved.width, defaults.width),
      height: defaults.height,
      y: saved.y < 80 ? saved.y : defaults.y,
    });
    log("BOUNDS", `Compact bar ${compact.width}x${compact.height}`);
    return compact;
  }

  log("BOUNDS", `Default compact ${defaults.width}x${defaults.height}`);
  return defaults;
}

function bindDisplayMetricsOnce() {
  if (displayMetricsBound) return;
  displayMetricsBound = true;
  screen.on("display-metrics-changed", () => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    applyCaptureExclusion(overlayWin);
    applyWindowConstraints(overlayWin);
    const bounds = overlayWin.getBounds();
    const clamped = clampBoundsToWorkArea(bounds);
    if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
      overlayWin.setBounds({ ...bounds, x: clamped.x, y: clamped.y }, false);
    }
  });
}

function wireWindowEvents(win: BrowserWindow) {
  win.webContents.on("did-finish-load", () => {
    const url = win.webContents.getURL();
    if (!url.startsWith("data:text/html")) companionLoadError = null;
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (win.isDestroyed() || !isMainFrame || code === -3) return;

    const bundled = resolveBundledCompanionPath();
    const devUrl = getCompanionDevUrl();
    if (
      !app.isPackaged &&
      bundled &&
      !companionDevFallbackAttempted &&
      (url === devUrl || url?.startsWith("http://127.0.0.1:"))
    ) {
      companionDevFallbackAttempted = true;
      companionLoadTarget = bundled;
      log("OVERLAY", "Dev server unavailable; loading built companion UI");
      void win.loadFile(bundled);
      return;
    }

    showCompanionLoadError(win, url || companionLoadTarget || devUrl, desc, code);
  });

  win.on("close", (e) => {
    if (allowQuit) return;
    e.preventDefault();
    void hideOverlay();
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      void hideOverlay();
    }
  });

  win.on("moved", schedulePersistBounds);
  win.on("resized", schedulePersistBounds);
  win.on("show", () => {
    win.webContents.setBackgroundThrottling(false);
    applyCaptureExclusion(win);
    resetIdleTimers();
  });
  win.on("hide", () => {
    win.webContents.setBackgroundThrottling(true);
    clearIdleTimers();
  });
  win.on("blur", () => scheduleAutoHide());
  win.on("focus", () => resetIdleTimers());
}

export function ensureOverlayWindow(): BrowserWindow {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;

  const initial = resolveInitialBounds();

  overlayWin = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: initial.x,
    y: initial.y,
    minWidth: COMPANION_MIN_WIDTH,
    minHeight: COMPANION_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    thickFrame: process.platform === "win32",
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    focusable: true,
    title: "CueAI Companion",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
      spellcheck: false,
      v8CacheOptions: "code",
    },
  });

  applyWindowConstraints(overlayWin);
  wireWindowEvents(overlayWin);
  bindDisplayMetricsOnce();

  const pinned = getStoreValue("companionPinned") !== false;
  overlayWin.setAlwaysOnTop(pinned, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setOpacity(getStoreValue("companionOpacity"));
  applyCaptureExclusion(overlayWin);
  loadCompanionUrl(overlayWin);

  bindScreenShareController({
    getWindow: () => overlayWin,
    setMode: setCompanionMode,
    setOpacity: setCompanionOpacity,
    show: () => void showOverlay(),
    hide: () => void hideOverlay(),
    dockPresenter: () => {
      if (overlayWin && !overlayWin.isDestroyed()) dockPresenterToEdge(overlayWin);
    },
  });

  log("OVERLAY", `Created ${initial.width}x${initial.height}`);
  return overlayWin;
}

export function createCompanionWindow() {
  return ensureOverlayWindow();
}

function schedulePersistBounds() {
  if (!overlayWin || overlayWin.isDestroyed() || resizeSession) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!overlayWin || overlayWin.isDestroyed()) return;
    const raw = overlayWin.getBounds();
    const safe = sanitizeBounds(raw);
    if (raw.width !== safe.width || raw.height !== safe.height) {
      overlayWin.setBounds(safe, false);
    }
    setStoreValue("companionBounds", safe);
    log("BOUNDS", `Persisted ${safe.width}x${safe.height}`);
  }, 400);
}

function clearIdleTimers() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
}

function resetIdleTimers() {
  clearIdleTimers();
}

function scheduleAutoHide() {
  clearIdleTimers();
  const settings = getStoreValue("desktopSettings");
  if (getMeetingSession().active) return;
  if (Date.now() < explicitShowGraceUntil) return;
  if (settings.autoHide) {
    hideTimer = setTimeout(() => {
      if (!overlayWin?.isFocused()) void hideOverlay();
    }, settings.autoHideMs ?? 90000);
  }
}

export function companionUserActivity() {
  resetIdleTimers();
}

function computeResizedBounds(
  start: Bounds,
  dir: ResizeDirection,
  dx: number,
  dy: number
): Bounds {
  const display = screen.getDisplayMatching(start).workArea;
  const max = getMaxBoundsForDisplay(display);
  let { x, y, width, height } = start;

  if (dir.includes("e")) {
    width = Math.min(max.width, Math.max(COMPANION_MIN_WIDTH, start.width + dx));
  }
  if (dir.includes("w")) {
    const nextW = Math.min(max.width, Math.max(COMPANION_MIN_WIDTH, start.width - dx));
    x = start.x + (start.width - nextW);
    width = nextW;
  }
  if (dir.includes("s")) {
    height = Math.min(max.height, Math.max(COMPANION_MIN_HEIGHT, start.height + dy));
  }
  if (dir.includes("n")) {
    const nextH = Math.min(max.height, Math.max(COMPANION_MIN_HEIGHT, start.height - dy));
    y = start.y + (start.height - nextH);
    height = nextH;
  }

  return clampBoundsToWorkArea({ x, y, width, height });
}

export function beginOverlayResize(dir: ResizeDirection): boolean {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return false;
  endOverlayResize();

  resizeSession = {
    dir,
    startBounds: win.getBounds(),
    startCursor: screen.getCursorScreenPoint(),
  };

  log("RESIZE", `Begin ${dir}`);

  resizeInterval = setInterval(() => {
    if (!resizeSession || !overlayWin || overlayWin.isDestroyed()) {
      endOverlayResize();
      return;
    }
    const cur = screen.getCursorScreenPoint();
    const dx = cur.x - resizeSession.startCursor.x;
    const dy = cur.y - resizeSession.startCursor.y;
    const next = computeResizedBounds(resizeSession.startBounds, resizeSession.dir, dx, dy);
    overlayWin.setBounds(next, false);
  }, 16);

  return true;
}

export function endOverlayResize() {
  if (resizeInterval) clearInterval(resizeInterval);
  resizeInterval = null;
  resizeSession = null;
  schedulePersistBounds();
  log("RESIZE", "End");
}

async function showOverlayInner() {
  const epoch = ++visibilityEpoch;
  explicitShowGraceUntil = Date.now() + 60_000;
  clearIdleTimers();
  log("OVERLAY", "Show requested");

  const win = ensureOverlayWindow();

  if (win.isMinimized()) win.restore();

  const clamped = clampBoundsToWorkArea(win.getBounds());
  if (
    clamped.width !== win.getBounds().width ||
    clamped.height !== win.getBounds().height ||
    clamped.x !== win.getBounds().x ||
    clamped.y !== win.getBounds().y
  ) {
    win.setBounds(clamped, false);
    log("BOUNDS", `Corrected bounds on show ${clamped.width}x${clamped.height}`);
  }
  applyWindowConstraints(win);

  if (getStoreValue("companionMode") === "collapsed") {
    setStoreValue("companionMode", "full");
    win.webContents.send("companion:mode", "full");
  }

  const pinned = getStoreValue("companionPinned") !== false;
  win.setAlwaysOnTop(pinned, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyCaptureExclusion(win);

  const opacity = getStoreValue("companionOpacity");
  const nextOpacity = Math.min(1, Math.max(0.35, Number(opacity) || 1));
  setStoreValue("companionOpacity", nextOpacity);
  win.setOpacity(nextOpacity);

  const url = win.webContents.getURL();
  const devUrl = getCompanionDevUrl();
  const bundled = resolveBundledCompanionPath();
  const expectsFile = app.isPackaged || Boolean(bundled);
  const needsReload =
    companionLoadError ||
    !url ||
    url === "about:blank" ||
    (expectsFile
      ? !url.startsWith("file:") && !url.startsWith("data:text/html")
      : !url.startsWith(devUrl) && !url.startsWith("data:text/html"));

  if (needsReload && !win.webContents.isLoading()) {
    log("OVERLAY", "Reloading companion UI");
    loadCompanionUrl(win);
  }

  if (!win.isVisible()) win.show();
  if (epoch !== visibilityEpoch || win.isDestroyed()) return;

  win.moveTop();
  win.focus();
  win.webContents.send("companion:visibility", true);
  win.webContents.send("companion:window-state", getCompanionWindowState());
  log("OVERLAY", "Visible");
}

export function showOverlay() {
  if (showPromise) return showPromise;
  showPromise = showOverlayInner().finally(() => {
    showPromise = null;
  });
  return showPromise;
}

export async function hideOverlay() {
  const epoch = ++visibilityEpoch;
  endOverlayResize();
  if (!overlayWin || overlayWin.isDestroyed() || !overlayWin.isVisible()) return;
  if (epoch !== visibilityEpoch) return;
  overlayWin.hide();
  overlayWin.webContents.send("companion:visibility", false);
  log("OVERLAY", "Hidden");
}

export function showCompanion() {
  return showOverlay();
}

export function hideCompanion() {
  return hideOverlay();
}

export function toggleOverlay() {
  const win = overlayWin;
  if (win && !win.isDestroyed() && win.isVisible()) return hideOverlay();
  return showOverlay();
}

export function toggleCompanion() {
  return toggleOverlay();
}

export function setCompanionMode(mode: CompanionMode) {
  setStoreValue("companionMode", mode);
  const win = overlayWin;
  if (!win || win.isDestroyed()) return;

  if (mode === "presenter") {
    dockPresenterToEdge(win);
    log("WINDOW", "Presenter dock");
  }

  win.webContents.send("companion:mode", mode === "collapsed" ? "full" : mode);
}

export function expandCompanion() {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return false;
  if (getStoreValue("companionExpanded")) return true;

  const current = win.getBounds();
  setStoreValue("companionNormalBounds", current);
  setStoreValue("companionExpanded", true);
  const next = expandedCompanionBounds(current);
  win.setBounds(next, true);
  applyWindowConstraints(win);
  win.webContents.send("companion:window-state", getCompanionWindowState());
  schedulePersistBounds();
  log("WINDOW", `Expanded ${next.width}x${next.height}`);
  return true;
}

export function restoreCompanion() {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return false;
  if (!getStoreValue("companionExpanded")) return true;

  const saved = getStoreValue("companionNormalBounds");
  setStoreValue("companionExpanded", false);
  const next = sanitizeBounds(saved ?? defaultCompanionBounds());
  win.setBounds(next, true);
  setStoreValue("companionNormalBounds", null);
  applyWindowConstraints(win);
  win.webContents.send("companion:window-state", getCompanionWindowState());
  schedulePersistBounds();
  log("WINDOW", `Restored ${next.width}x${next.height}`);
  return true;
}

export function fitCompanionHeight(height: number) {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return false;
  if (getStoreValue("companionExpanded")) return true;

  const current = win.getBounds();
  const next = clampBoundsToWorkArea({
    ...current,
    height: Math.round(Number(height) || COMPANION_DEFAULT_HEIGHT),
  });
  win.setBounds(next, true);
  applyWindowConstraints(win);
  win.webContents.send("companion:window-state", getCompanionWindowState());
  schedulePersistBounds();
  return true;
}

export function resetCompanionSize() {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return false;

  setStoreValue("companionExpanded", false);
  setStoreValue("companionNormalBounds", null);
  const next = defaultCompanionBounds();
  win.setBounds(next, true);
  setStoreValue("companionBounds", next);
  applyWindowConstraints(win);
  win.webContents.send("companion:window-state", getCompanionWindowState());
  log("BOUNDS", `Reset ${next.width}x${next.height}`);
  return true;
}

export function setCompanionPinned(pinned: boolean) {
  setStoreValue("companionPinned", pinned);
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setAlwaysOnTop(pinned, "screen-saver");
    if (pinned) {
      overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      overlayWin.moveTop();
    }
  }
}

export function setCompanionOpacity(opacity: number) {
  const next = Math.min(1, Math.max(0.35, Number(opacity) || 1));
  setStoreValue("companionOpacity", next);
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
    overlayWin.setOpacity(next);
  }
}

export function destroyOverlay() {
  endOverlayResize();
  if (overlayWin && !overlayWin.isDestroyed()) {
    allowQuit = true;
    overlayWin.destroy();
  }
  overlayWin = null;
}
