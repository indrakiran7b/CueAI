/**
 * Server-side Keygate adapter. Secrets never leave the Next.js process.
 * When KEYGATE_BASE_URL / KEYGATE_API_KEY are unset, licensing stays on the
 * existing CueAI license store.
 */

export type KeygateResult = {
  skipped: boolean;
  ok: boolean;
  status?: string;
  message?: string;
};

function keygateConfig() {
  const baseUrl = process.env.KEYGATE_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.KEYGATE_API_KEY?.trim();
  return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}

export function isKeygateConfigured() {
  return Boolean(keygateConfig());
}

export async function keygateValidateLicense(input: {
  licenseKey?: string;
  licenseId?: string;
  deviceId: string;
  userId?: string;
  platform?: string;
}): Promise<KeygateResult> {
  const config = keygateConfig();
  if (!config) return { skipped: true, ok: true };

  try {
    const res = await fetch(`${config.baseUrl}/licenses/validate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        licenseKey: input.licenseKey,
        licenseId: input.licenseId,
        deviceId: input.deviceId,
        userId: input.userId,
        platform: input.platform,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      valid?: boolean;
      ok?: boolean;
      status?: string;
      message?: string;
    };
    const ok = res.ok && (data.valid === true || data.ok === true || data.status === "ACTIVE");
    return {
      skipped: false,
      ok,
      status: data.status,
      message: data.message,
    };
  } catch (err) {
    return {
      skipped: false,
      ok: false,
      status: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Keygate unreachable",
    };
  }
}
