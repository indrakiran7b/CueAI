import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { CueStoreSchema } from "../ipc/channels";

const defaults: CueStoreSchema = {
  theme: "dark",
  workspace: "CueAI",
  mainBounds: null,
  companionBounds: null,
  companionMode: "full",
  companionModeBeforeShare: null,
  companionOpacity: 1,
  companionPinned: true,
  launchAtStartup: false,
  recentMeetings: [],
  pinnedAnswers: [],
  desktopSettings: {
    minimizeToTray: true,
    showNotifications: true,
    globalShortcuts: true,
    excludeFromCapture: true,
    autoPresentOnMeeting: true,
    autoHide: false,
    autoHideMs: 90000,
    autoCollapse: true,
    autoCollapseMs: 45000,
    presenterOpacity: 0.72,
  },
};

function storePath() {
  return path.join(app.getPath("userData"), "cueai-desktop-store.json");
}

function readStore(): CueStoreSchema {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CueStoreSchema>;
    return {
      ...defaults,
      ...parsed,
      desktopSettings: {
        ...defaults.desktopSettings,
        ...(parsed.desktopSettings || {}),
      },
    };
  } catch {
    return { ...defaults };
  }
}

function writeStore(data: CueStoreSchema) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), "utf8");
}

let cache: CueStoreSchema | null = null;

function ensure(): CueStoreSchema {
  if (!cache) cache = readStore();
  return cache;
}

export function getStoreValue<K extends keyof CueStoreSchema>(key: K): CueStoreSchema[K] {
  return ensure()[key];
}

export function setStoreValue<K extends keyof CueStoreSchema>(
  key: K,
  value: CueStoreSchema[K]
): void {
  const next = { ...ensure(), [key]: value };
  cache = next;
  writeStore(next);
}

export function getAllStore(): CueStoreSchema {
  return { ...ensure() };
}
