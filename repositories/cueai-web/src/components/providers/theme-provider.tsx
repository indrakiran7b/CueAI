"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_PALETTE, isPalettePreference, type PalettePreference } from "@/lib/themes";

type Theme = "dark" | "light";

/** Where the last palette change was stored. */
export type PaletteSaveState = "idle" | "saving" | "saved" | "local-only";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  palette: PalettePreference;
  paletteSaveState: PaletteSaveState;
  setPalette: (palette: PalettePreference) => Promise<void>;
  resetPalette: () => Promise<void>;
  /** Called by PaletteSync when the signed-in user changes (null = signed out). */
  syncPaletteForUser: (userId: string | null) => Promise<void>;
};

/** Read by the inline boot script in app/layout.tsx so the palette applies before first paint. */
export const PALETTE_LAST_KEY = "cueai-palette-last";
const paletteUserKey = (userId: string) => `cueai-palette:${userId}`;

function readDocumentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("cueai-theme", next);
}

function readStored(key: string): PalettePreference | null {
  try {
    const v = localStorage.getItem(key);
    return isPalettePreference(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: PalettePreference) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the in-memory palette still applies.
  }
}

function applyPalette(next: PalettePreference) {
  const root = document.documentElement;
  if (next === "default") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", next);
  writeStored(PALETTE_LAST_KEY, next);
}

async function savePaletteRemote(palette: PalettePreference): Promise<boolean> {
  try {
    const res = await fetch("/api/settings/appearance", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palette }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  palette: DEFAULT_PALETTE,
  paletteSaveState: "idle",
  setPalette: async () => {},
  resetPalette: async () => {},
  syncPaletteForUser: async () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [hydrated, setHydrated] = useState(false);
  const [palette, setPaletteState] = useState<PalettePreference>(DEFAULT_PALETTE);
  const [paletteSaveState, setPaletteSaveState] = useState<PaletteSaveState>("idle");
  const userRef = useRef<string | null>(null);
  const syncGeneration = useRef(0);

  useEffect(() => {
    const stored = localStorage.getItem("cueai-theme");
    const initial = stored === "light" || stored === "dark" ? stored : readDocumentTheme();
    applyTheme(initial);
    const bootPalette = document.documentElement.getAttribute("data-palette");
    queueMicrotask(() => {
      setThemeState(initial);
      setPaletteState(isPalettePreference(bootPalette) ? bootPalette : DEFAULT_PALETTE);
      setHydrated(true);
    });
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  const showPalette = useCallback((next: PalettePreference) => {
    applyPalette(next);
    setPaletteState(next);
  }, []);

  const setPalette = useCallback(
    async (next: PalettePreference) => {
      syncGeneration.current += 1;
      showPalette(next);
      const userId = userRef.current;
      if (!userId) {
        setPaletteSaveState("local-only");
        return;
      }
      writeStored(paletteUserKey(userId), next);
      setPaletteSaveState("saving");
      const ok = await savePaletteRemote(next);
      if (userRef.current === userId) setPaletteSaveState(ok ? "saved" : "local-only");
    },
    [showPalette],
  );

  const resetPalette = useCallback(() => setPalette(DEFAULT_PALETTE), [setPalette]);

  const syncPaletteForUser = useCallback(
    async (userId: string | null) => {
      const generation = ++syncGeneration.current;
      userRef.current = userId;
      setPaletteSaveState("idle");
      if (!userId) {
        // Signed out: show the default look; each user's own choice stays in their cache and account.
        showPalette(DEFAULT_PALETTE);
        return;
      }
      const cached = readStored(paletteUserKey(userId));
      showPalette(cached ?? DEFAULT_PALETTE);
      try {
        const res = await fetch("/api/settings/appearance", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { palette?: unknown };
        if (generation !== syncGeneration.current) return;
        if (isPalettePreference(body.palette)) {
          writeStored(paletteUserKey(userId), body.palette);
          showPalette(body.palette);
        }
      } catch {
        // Keep the last valid (cached) palette when the preference API is unreachable.
      }
    },
    [showPalette],
  );

  return (
    <ThemeContext.Provider
      value={{
        theme: hydrated ? theme : "dark",
        setTheme,
        toggleTheme,
        palette,
        paletteSaveState,
        setPalette,
        resetPalette,
        syncPaletteForUser,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
