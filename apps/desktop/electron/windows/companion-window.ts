import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import type { CompanionMode } from "../ipc/channels";
import { getStoreValue, setStoreValue } from "../services/store";
import {
  applyCaptureExclusion,
  bindScreenShareController,
  clampBoundsToVisibleDisplay,
  dockPresenterToEdge,
  getMeetingSession,
} from "../services/screen-share";

const MODE_SIZE: Record<CompanionMode, { width: number; height: number }> = {
  full: { width: 380, height: 420 },
  mini: { width: 300, height: 220 },
  collapsed: { width: 240, height: 64 },
  presenter: { width: 340, height: 200 },
};

let companionWin: BrowserWindow | null = null;
let allowQuit = false;
let animating = false;
let visibilityEpoch = 0;
let idleTimer: NodeJS.Timeout | null = null;
let hideTimer: NodeJS.Timeout | null = null;

export function allowCompanionQuit() {
  allowQuit = true;
}

export function getCompanionWindow() {
  return companionWin;
}

export function createCompanionWindow(): BrowserWindow {
  if (companionWin && !companionWin.isDestroyed()) {
    return companionWin;
  }

  const isDev = !app.isPackaged;
  const saved = getStoreValue("companionBounds");
  const mode = getStoreValue("companionMode");
  const size = MODE_SIZE[mode];
  const display = screen.getPrimaryDisplay().workArea;

  const initial = clampBoundsToVisibleDisplay({
    width: saved?.width ?? size.width,
    height: saved?.height ?? size.height,
    x: saved?.x ?? display.x + display.width - (size.width + 24),
    y: saved?.y ?? display.y + Math.round(display.height * 0.12),
  });

  companionWin = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: initial.x,
    y: initial.y,
    minWidth: 220,
    minHeight: 64,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    focusable: true,
    title: "CueAI Companion",
    // Keep companion light when backgrounded; raise when shown.
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

  // OS-level always-on-top (screen-saver level beats most fullscreen apps on Windows).
  const pinned = getStoreValue("companionPinned") !== false;
  companionWin.setAlwaysOnTop(pinned, "screen-saver");
  companionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  companionWin.setOpacity(getStoreValue("companionOpacity"));

  // Privacy / exclude-from-capture ON by default (desktopSettings.excludeFromCapture).
  applyCaptureExclusion(companionWin);

  if (isDev) {
    void companionWin.loadURL("http://localhost:5173");
  } else {
    void companionWin.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  companionWin.on("close", (e) => {
    if (allowQuit || !companionWin) return;
    e.preventDefault();
    void hideCompanionAnimated();
  });

  companionWin.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      void hideCompanionAnimated();
    }
  });

  companionWin.on("moved", persistBounds);
  companionWin.on("resized", persistBounds);
  companionWin.on("show", () => {
    companionWin?.webContents.setBackgroundThrottling(false);
    applyCaptureExclusion(companionWin);
    resetIdleTimers();
  });
  companionWin.on("hide", () => {
    companionWin?.webContents.setBackgroundThrottling(true);
    clearIdleTimers();
  });
  companionWin.on("blur", () => {
    scheduleAutoHideOrCollapse();
  });
  companionWin.on("focus", () => {
    resetIdleTimers();
  });

  bindScreenShareController({
    getWindow: () => companionWin,
    setMode: setCompanionMode,
    setOpacity: setCompanionOpacity,
    show: () => void showCompanionAnimated(),
    hide: () => void hideCompanionAnimated(),
    dockPresenter: () => {
      if (companionWin && !companionWin.isDestroyed()) {
        dockPresenterToEdge(companionWin);
      }
    },
  });

  // Re-apply protection if displays change (multi-monitor)
  screen.on("display-metrics-changed", () => {
    if (companionWin && !companionWin.isDestroyed()) {
      applyCaptureExclusion(companionWin);
      const bounds = companionWin.getBounds();
      const clamped = clampBoundsToVisibleDisplay(bounds);
      if (
        clamped.x !== bounds.x ||
        clamped.y !== bounds.y ||
        clamped.width !== bounds.width ||
        clamped.height !== bounds.height
      ) {
        companionWin.setBounds(clamped, true);
      }
    }
  });

  return companionWin;
}

function persistBounds() {
  if (!companionWin || companionWin.isDestroyed() || animating) return;
  setStoreValue("companionBounds", companionWin.getBounds());
}

function clearIdleTimers() {
  if (idleTimer) clearTimeout(idleTimer);
  if (hideTimer) clearTimeout(hideTimer);
  idleTimer = null;
  hideTimer = null;
}

function resetIdleTimers() {
  clearIdleTimers();
}

function scheduleAutoHideOrCollapse() {
  clearIdleTimers();
  const settings = getStoreValue("desktopSettings");
  const mode = getStoreValue("companionMode");

  // Never auto-dismiss during an active meeting session — only End Session / Close.
  if (getMeetingSession().active) return;

  if (settings.autoCollapse && mode === "full") {
    idleTimer = setTimeout(() => {
      if (!companionWin?.isFocused()) setCompanionMode("collapsed");
    }, settings.autoCollapseMs ?? 45000);
  }

  if (settings.autoHide) {
    hideTimer = setTimeout(() => {
      if (!companionWin?.isFocused()) void hideCompanionAnimated();
    }, settings.autoHideMs ?? 90000);
  }
}

/** Called from renderer when the user interacts with companion UI. */
export function companionUserActivity() {
  resetIdleTimers();
}

async function fadeOpacity(win: BrowserWindow, from: number, to: number, ms = 140) {
  animating = true;
  const steps = 8;
  const dt = ms / steps;
  for (let i = 1; i <= steps; i++) {
    if (win.isDestroyed()) break;
    const t = i / steps;
    win.setOpacity(from + (to - from) * t);
    await new Promise((r) => setTimeout(r, dt));
  }
  animating = false;
}

export async function showCompanionAnimated() {
  const epoch = ++visibilityEpoch;
  const win = createCompanionWindow();

  // Re-assert OS overlay traits every show (survives display changes / unpin edge cases).
  const pinned = getStoreValue("companionPinned") !== false;
  win.setAlwaysOnTop(pinned, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyCaptureExclusion(win);

  // Always full window opacity — panel transparency is handled in CSS.
  setStoreValue("companionOpacity", 1);
  win.setOpacity(1);

  // Already visible: don't re-run fade animations (stops Private/Live flicker).
  if (win.isVisible()) {
    win.moveTop();
    win.focus();
    win.webContents.send("companion:visibility", true);
    return;
  }

  win.showInactive();
  if (epoch !== visibilityEpoch || win.isDestroyed()) return;
  win.focus();
  win.webContents.send("companion:visibility", true);
}

export async function hideCompanionAnimated() {
  const epoch = ++visibilityEpoch;
  if (!companionWin || companionWin.isDestroyed() || !companionWin.isVisible()) return;
  // Instant hide — no opacity fade (overlay is CSS-transparent, not window-dimmed).
  if (epoch !== visibilityEpoch) return;
  if (!companionWin.isDestroyed()) {
    companionWin.hide();
    companionWin.setOpacity(1);
    companionWin.webContents.send("companion:visibility", false);
  }
}

export function showCompanion() {
  void showCompanionAnimated();
}

export function hideCompanion() {
  void hideCompanionAnimated();
}

export function toggleCompanion() {
  const win = createCompanionWindow();
  if (win.isVisible()) void hideCompanionAnimated();
  else void showCompanionAnimated();
}

export function setCompanionMode(mode: CompanionMode) {
  setStoreValue("companionMode", mode);
  const win = companionWin;
  if (!win || win.isDestroyed()) return;

  if (mode === "presenter") {
    dockPresenterToEdge(win);
  } else {
    const size = MODE_SIZE[mode];
    const [x, y] = win.getPosition();
    const display = screen.getDisplayMatching(win.getBounds()).workArea;
    const next = clampBoundsToVisibleDisplay({
      x,
      y,
      width: size.width,
      height: size.height,
    });
    // Prefer keeping x/y when still on-screen
    win.setBounds(
      {
        x: Math.min(Math.max(display.x, next.x), display.x + display.width - size.width),
        y: Math.min(Math.max(display.y, next.y), display.y + display.height - size.height),
        ...size,
      },
      true
    );
  }

  win.webContents.send("companion:mode", mode);
}

export function setCompanionPinned(pinned: boolean) {
  setStoreValue("companionPinned", pinned);
  if (companionWin && !companionWin.isDestroyed()) {
    companionWin.setAlwaysOnTop(pinned, "screen-saver");
    if (pinned) {
      companionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      companionWin.moveTop();
    }
  }
}

export function setCompanionOpacity(_opacity: number) {
  // Overlay stays fully opaque at the window level; visual transparency is CSS-only.
  setStoreValue("companionOpacity", 1);
  if (companionWin && !companionWin.isDestroyed() && companionWin.isVisible()) {
    companionWin.setOpacity(1);
  }
}
