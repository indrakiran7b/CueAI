/**
 * Companion overlay window sizing — single source of truth for safe native bounds.
 */

import { screen } from "electron";

export const COMPANION_MIN_WIDTH = 400;
export const COMPANION_MIN_HEIGHT = 420;

/** Default compact overlay size (user can resize above minimum). */
export const COMPANION_DEFAULT_WIDTH = 480;
export const COMPANION_DEFAULT_HEIGHT = 600;

/** Expanded preset for more transcript / answer space. */
export const COMPANION_EXPANDED_WIDTH = 720;
export const COMPANION_EXPANDED_HEIGHT = 760;

/** Presenter dock strip — still above absolute minimum. */
export const COMPANION_PRESENTER_WIDTH = 420;
export const COMPANION_PRESENTER_HEIGHT = 280;

export type Bounds = { x: number; y: number; width: number; height: number };

export function clampDimension(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeBounds(bounds: Partial<Bounds> | null | undefined): Bounds {
  const primary = screen.getPrimaryDisplay().workArea;
  const width = clampDimension(
    Math.round(bounds?.width ?? COMPANION_DEFAULT_WIDTH),
    COMPANION_MIN_WIDTH,
    primary.width - 32
  );
  const height = clampDimension(
    Math.round(bounds?.height ?? COMPANION_DEFAULT_HEIGHT),
    COMPANION_MIN_HEIGHT,
    primary.height - 32
  );
  const x =
    typeof bounds?.x === "number"
      ? bounds.x
      : primary.x + primary.width - width - 24;
  const y =
    typeof bounds?.y === "number"
      ? bounds.y
      : primary.y + Math.round(primary.height * 0.1);

  return clampBoundsToWorkArea({ x, y, width, height });
}

/** Keep bounds on a visible display work area (multi-monitor + DPI safe). */
export function clampBoundsToWorkArea(bounds: Bounds): Bounds {
  const displays = screen.getAllDisplays();
  const intersects = displays.some((d) => {
    const a = d.workArea;
    return (
      bounds.x + bounds.width > a.x + 8 &&
      bounds.x < a.x + a.width - 8 &&
      bounds.y + bounds.height > a.y + 8 &&
      bounds.y < a.y + a.height - 8
    );
  });

  const target = intersects
    ? screen.getDisplayMatching(bounds).workArea
    : screen.getPrimaryDisplay().workArea;

  const width = clampDimension(bounds.width, COMPANION_MIN_WIDTH, target.width - 16);
  const height = clampDimension(bounds.height, COMPANION_MIN_HEIGHT, target.height - 16);
  const x = clampDimension(bounds.x, target.x, target.x + target.width - width);
  const y = clampDimension(bounds.y, target.y, target.y + target.height - height);

  return { x, y, width, height };
}

export function defaultCompanionBounds(): Bounds {
  const primary = screen.getPrimaryDisplay().workArea;
  return sanitizeBounds({
    width: COMPANION_DEFAULT_WIDTH,
    height: COMPANION_DEFAULT_HEIGHT,
    x: primary.x + primary.width - COMPANION_DEFAULT_WIDTH - 24,
    y: primary.y + Math.round(primary.height * 0.1),
  });
}

export function expandedCompanionBounds(current: Bounds): Bounds {
  const next = {
    ...current,
    width: COMPANION_EXPANDED_WIDTH,
    height: COMPANION_EXPANDED_HEIGHT,
  };
  return clampBoundsToWorkArea(next);
}

export function isValidPersistedBounds(bounds: Bounds | null | undefined): bounds is Bounds {
  if (!bounds) return false;
  return (
    bounds.width >= COMPANION_MIN_WIDTH &&
    bounds.height >= COMPANION_MIN_HEIGHT &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y)
  );
}

export function getMaxBoundsForDisplay(workArea: { width: number; height: number }) {
  return {
    width: Math.max(COMPANION_MIN_WIDTH, workArea.width - 16),
    height: Math.max(COMPANION_MIN_HEIGHT, workArea.height - 16),
  };
}
