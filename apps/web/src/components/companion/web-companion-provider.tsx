"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CaptureStatus, MeetingSession } from "@/lib/desktop";
import { WebCompanionOverlay } from "./web-companion-overlay";

export const WEB_COMPANION_EVENT = "cueai:web-companion";
export const WEB_COMPANION_SESSION_EVENT = "cueai:web-companion-session";
const STORAGE_KEY = "cueai-web-companion-open";

export type WebCompanionAction = "open" | "close" | "toggle";
export type CompanionMode = "full" | "mini" | "collapsed" | "presenter";
export type CompanionPanel = "answer" | "transcript" | "actions" | "translate";

const DEFAULT_SESSION: MeetingSession = {
  active: false,
  screenSharing: false,
  cueAiMode: "inactive",
};

const DEFAULT_CAPTURE: CaptureStatus = {
  requested: true,
  applied: false,
  supported: false,
  message: "Screen-share exclusion requires CueAI Desktop",
};

type WebCompanionContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  mode: CompanionMode;
  setMode: (mode: CompanionMode) => void;
  panel: CompanionPanel;
  setPanel: (panel: CompanionPanel) => void;
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  session: MeetingSession;
  setSession: (session: MeetingSession) => void;
  capture: CaptureStatus;
  setCapture: (capture: CaptureStatus) => void;
};

const WebCompanionContext = createContext<WebCompanionContextValue | null>(null);

function readStoredOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredOpen(open: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Dispatch from non-React callers (e.g. desktop.ts fallback). */
export function dispatchWebCompanion(action: WebCompanionAction = "open") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WEB_COMPANION_EVENT, { detail: { action } })
  );
}

/** Sync meeting session into the in-page companion (browser fallback). */
export function dispatchWebCompanionSession(session: Partial<MeetingSession>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WEB_COMPANION_SESSION_EVENT, { detail: { session } })
  );
}

export function WebCompanionProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<CompanionMode>("full");
  const [panel, setPanel] = useState<CompanionPanel>("answer");
  const [pinned, setPinned] = useState(true);
  const [session, setSession] = useState<MeetingSession>(DEFAULT_SESSION);
  const [capture, setCapture] = useState<CaptureStatus>(DEFAULT_CAPTURE);

  useEffect(() => {
    setIsOpen(readStoredOpen());
  }, []);

  const apply = useCallback((next: boolean) => {
    setIsOpen(next);
    writeStoredOpen(next);
  }, []);

  const open = useCallback(() => apply(true), [apply]);
  const close = useCallback(() => apply(false), [apply]);
  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      writeStoredOpen(next);
      return next;
    });
  }, []);

  useEffect(() => {
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<{ action?: WebCompanionAction }>).detail;
      const action = detail?.action ?? "open";
      if (action === "close") {
        apply(false);
        return;
      }
      if (action === "toggle") {
        setIsOpen((prev) => {
          const next = !prev;
          writeStoredOpen(next);
          return next;
        });
        return;
      }
      apply(true);
    }
    window.addEventListener(WEB_COMPANION_EVENT, onEvent);
    return () => window.removeEventListener(WEB_COMPANION_EVENT, onEvent);
  }, [apply]);

  useEffect(() => {
    function onSession(e: Event) {
      const detail = (e as CustomEvent<{ session?: Partial<MeetingSession> }>).detail;
      if (!detail?.session) return;
      setSession((prev) => ({ ...prev, ...detail.session }));
    }
    window.addEventListener(WEB_COMPANION_SESSION_EVENT, onSession);
    return () => window.removeEventListener(WEB_COMPANION_SESSION_EVENT, onSession);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      mode,
      setMode,
      panel,
      setPanel,
      pinned,
      setPinned,
      session,
      setSession,
      capture,
      setCapture,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      mode,
      panel,
      pinned,
      session,
      capture,
    ]
  );

  return (
    <WebCompanionContext.Provider value={value}>
      {children}
      <WebCompanionOverlay />
    </WebCompanionContext.Provider>
  );
}

export function useWebCompanion() {
  const ctx = useContext(WebCompanionContext);
  if (!ctx) {
    throw new Error("useWebCompanion must be used within WebCompanionProvider");
  }
  return ctx;
}
