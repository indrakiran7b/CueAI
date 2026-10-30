/**
 * What the Answer button answers: the typed question first, otherwise the last question heard.
 * Returns null when there is nothing to answer — the overlay never substitutes a default prompt.
 */
export function pickManualQuestion(typed: string | null | undefined, lastHeard: string | null | undefined): string | null {
  const t = typed?.trim();
  if (t) return t;
  const h = lastHeard?.trim();
  return h || null;
}
