export const TRANSPARENCY_MIN = 0;
export const TRANSPARENCY_MAX = 80;
export const TRANSPARENCY_STEP = 5;
export const TRANSPARENCY_DEFAULT = 0;

export function clampTransparency(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return TRANSPARENCY_DEFAULT;
  return Math.min(TRANSPARENCY_MAX, Math.max(TRANSPARENCY_MIN, Math.round(n)));
}

const FILL_ALPHA = 0.72;
const FIELD_ALPHA = 0.78;
const MENU_ALPHA = 0.94;
const BLUR_PX = 40;

/**
 * Overrides for the HUD's --hud-* variables at a transparency percentage. Empty at 0% so the
 * stylesheet defaults apply unchanged. Panel alphas scale down and the backdrop blur fades out
 * quickly, so the screen behind becomes readable; text keeps its colour. Menus keep at least 90%
 * opacity so their items stay legible over the answer underneath.
 */
export function overlayTransparencyVars(percent: number): Record<string, string> {
  const p = clampTransparency(percent);
  if (p <= TRANSPARENCY_MIN) return {};
  const keep = 1 - p / 100;
  const blur = Math.round(BLUR_PX * (1 - p / TRANSPARENCY_MAX) ** 3);
  const a = (base: number) => (base * keep).toFixed(3);
  return {
    "--hud-fill": `rgba(14, 14, 16, ${a(FILL_ALPHA)})`,
    "--hud-field": `rgba(28, 28, 30, ${a(FIELD_ALPHA)})`,
    "--hud-menu": `rgba(22, 22, 24, ${Math.max(MENU_ALPHA * keep, 0.9).toFixed(3)})`,
    "--hud-blur": `${blur}px`,
  };
}
