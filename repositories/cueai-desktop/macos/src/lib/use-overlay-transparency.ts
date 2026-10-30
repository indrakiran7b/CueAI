import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { TRANSPARENCY_DEFAULT, clampTransparency, overlayTransparencyVars } from "./overlay-transparency";

const SAVE_DELAY_MS = 250;
const SAVE_FAILED = "Transparency couldn't be saved. It applies until the overlay closes.";

/** Overlay transparency: restored from the desktop store, applied as CSS variables, saved after changes settle. */
export function useOverlayTransparency() {
  const [value, setValue] = useState(TRANSPARENCY_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const pendingRef = useRef<number | null>(null);

  const save = useCallback((next: number) => {
    pendingRef.current = null;
    const setter = window.cueai?.setTransparency;
    if (!setter) {
      setError(SAVE_FAILED);
      return;
    }
    setter(next).then(
      () => setError(null),
      () => setError(SAVE_FAILED),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const getter = window.cueai?.getTransparency;
    if (!getter) return;
    getter().then(
      (saved) => {
        if (!cancelled && pendingRef.current === null) setValue(clampTransparency(saved));
      },
      () => {
        if (!cancelled) setError("Saved transparency couldn't be loaded.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      if (pendingRef.current !== null) void window.cueai?.setTransparency?.(pendingRef.current).catch(() => {});
    },
    [],
  );

  const change = useCallback(
    (next: number) => {
      const v = clampTransparency(next);
      setValue(v);
      pendingRef.current = v;
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => save(v), SAVE_DELAY_MS);
    },
    [save],
  );

  const style = useMemo(() => overlayTransparencyVars(value) as CSSProperties, [value]);
  return { value, change, error, style };
}
