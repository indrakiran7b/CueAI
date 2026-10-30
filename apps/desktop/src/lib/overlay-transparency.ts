export const TRANSPARENCY_MIN = 0;
export const TRANSPARENCY_MAX = 80;
export const TRANSPARENCY_STEP = 5;
export const TRANSPARENCY_DEFAULT = 0;

export function clampTransparency(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return TRANSPARENCY_DEFAULT;
  return Math.min(TRANSPARENCY_MAX, Math.max(TRANSPARENCY_MIN, Math.round(n)));
}

/** Opacity of the overlay's panel backgrounds; text and icons stay fully opaque. */
export function surfaceAlpha(percent: number): number {
  return Number((1 - clampTransparency(percent) / 100).toFixed(2));
}

/**
 * CSS custom properties for the overlay at a transparency percentage. Empty at 0% so the
 * stylesheet's opaque defaults apply. Menus keep at least 90% opacity so their items stay legible
 * over the answer underneath.
 */
export function overlayTransparencyVars(percent: number): Record<string, string> {
  const p = clampTransparency(percent);
  if (p <= TRANSPARENCY_MIN) return {};
  const alpha = surfaceAlpha(p);
  return {
    "--ov-alpha": String(alpha),
    "--ov-menu-alpha": String(Math.max(alpha, 0.9)),
    "--ov-line": "rgba(255, 255, 255, 0.22)",
  };
}
