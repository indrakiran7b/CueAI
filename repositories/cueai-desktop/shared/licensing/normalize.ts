export function normalizeLicenseKeyInput(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export function maskLicenseKey(raw: string): string {
  const n = normalizeLicenseKeyInput(raw);
  if (n.length <= 8) return "••••••••";
  return `${n.slice(0, 8)}••••${n.slice(-4)}`;
}
