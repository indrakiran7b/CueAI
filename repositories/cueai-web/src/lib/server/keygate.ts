/**
 * Keygate HTTP client — server-side only.
 *
 * Desktop apps never call Keygate. CueAI backend is the intermediary:
 *   Windows/macOS → CueAI /api/license/* → Keygate /api/v1/license/*
 *
 * Public SDK routes use `license_key` in the body (no admin key).
 * `KEYGATE_SERVER_API_KEY` is only for optional /admin/* automation.
 */

export type KeygateLicenseStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "suspended"
  | "revoked"
  | "activated"
  | "already_activated";

export type KeygateMappedState =
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "REVOKED"
  | "INVALID"
  | "DEVICE_LIMIT_REACHED"
  | "NOT_ACTIVATED"
  | "NETWORK_ERROR";

export type KeygateVerifyData = {
  status: KeygateLicenseStatus | string;
  license_id?: string;
  plan_id?: string;
  plan_name?: string;
  valid_until?: string | null;
  updates_until?: string | null;
  features?: Record<string, unknown>;
  token?: string;
  grace_days?: number;
};

export type KeygateActivateData = {
  status: "activated" | "already_activated" | string;
  license_id?: string;
  token?: string;
};

export type KeygateEntitlementFeatures = Record<
  string,
  | boolean
  | string
  | number
  | {
      enabled?: boolean;
      value?: string | number | boolean;
      limit?: number | null;
      remaining?: number | null;
    }
>;

type KeygateEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

/** True when Keygate is configured as the online license authority. */
export function isKeygateEnabled(): boolean {
  return Boolean(process.env.KEYGATE_BASE_URL?.trim());
}

function keygateBaseUrl(): string {
  const base = process.env.KEYGATE_BASE_URL?.trim();
  if (!base) throw new Error("KEYGATE_BASE_URL is not configured.");
  // Accept either https://host or https://host/api/v1
  const normalized = trimSlash(base);
  return /\/api\/v1$/i.test(normalized) ? normalized : `${normalized}/api/v1`;
}

function productId(): string | undefined {
  const id = process.env.KEYGATE_PRODUCT_ID?.trim();
  return id || undefined;
}

function adminApiKey(): string | undefined {
  const key =
    process.env.KEYGATE_SERVER_API_KEY?.trim() ||
    process.env.KEYGATE_API_KEY?.trim();
  return key || undefined;
}

/** Optional Ed25519 public key (hex) for verifying Keygate offline tokens. */
export function keygatePublicKeyHex(): string | undefined {
  const key = process.env.KEYGATE_PUBLIC_KEY?.trim();
  return key || undefined;
}

export function mapKeygateStatusToCueState(
  status: string | undefined,
  httpStatus?: number,
  errorCode?: string,
): KeygateMappedState {
  if (httpStatus === 409 || errorCode === "ACTIVATION_LIMIT") {
    return "DEVICE_LIMIT_REACHED";
  }
  if (httpStatus === 429 || errorCode === "LOCKED_OUT") {
    return "NETWORK_ERROR";
  }
  if (httpStatus === 404 || errorCode === "LICENSE_NOT_FOUND") {
    return "INVALID";
  }

  const s = String(status || "").toLowerCase();
  if (s === "active" || s === "trialing" || s === "activated" || s === "already_activated") {
    return "ACTIVE";
  }
  if (s === "expired") return "EXPIRED";
  if (s === "suspended" || s === "past_due") return "SUSPENDED";
  if (s === "revoked" || s === "canceled" || s === "cancelled") return "REVOKED";
  if (httpStatus === 403) {
    // Activate may return 403 for expired/suspended/revoked without a clear status.
    return "REVOKED";
  }
  return "INVALID";
}

export function userMessageForKeygateState(state: KeygateMappedState): string {
  switch (state) {
    case "EXPIRED":
      return "Your CueAI license has expired.";
    case "SUSPENDED":
      return "Your CueAI license is suspended. Contact support or renew your subscription.";
    case "REVOKED":
      return "Your CueAI license has been revoked.";
    case "DEVICE_LIMIT_REACHED":
      return "This license has reached its device limit.";
    case "INVALID":
      return "That license key is invalid or cannot be used on this device.";
    case "NOT_ACTIVATED":
      return "This device is not activated.";
    case "NETWORK_ERROR":
      return "Unable to reach the license service. Please try again shortly.";
    default:
      return "License validation failed.";
  }
}

/**
 * Map Keygate plan/features → CueAI entitlements (role remains separate).
 */
export function entitlementsFromKeygate(input: {
  planName?: string | null;
  features?: Record<string, unknown> | null;
}): {
  plan: "free" | "pro" | "business" | "enterprise";
  entitlements: {
    "meeting.full_summary": boolean;
    "meeting.max_questions": number;
    desktop_companion: boolean;
  };
} {
  const planRaw = String(input.planName || "").trim().toLowerCase();
  let plan: "free" | "pro" | "business" | "enterprise" = "free";
  if (planRaw.includes("enterprise")) plan = "enterprise";
  else if (planRaw.includes("business") || planRaw.includes("team")) plan = "business";
  else if (
    planRaw.includes("pro") ||
    planRaw.includes("premium") ||
    planRaw.includes("professional")
  ) {
    plan = "pro";
  }

  const features = input.features || {};
  const featureEnabled = (key: string): boolean | undefined => {
    const v = features[key];
    if (v === true || v === "true" || v === 1) return true;
    if (v === false || v === "false" || v === 0) return false;
    if (v && typeof v === "object" && "enabled" in (v as object)) {
      return Boolean((v as { enabled?: boolean }).enabled);
    }
    return undefined;
  };

  const fullFromFeature =
    featureEnabled("meeting.full_summary") ??
    featureEnabled("meeting_full_summary") ??
    featureEnabled("full_summary");

  const companionFromFeature =
    featureEnabled("desktop_companion") ?? featureEnabled("desktop.companion");

  const premiumPlan = plan === "pro" || plan === "business" || plan === "enterprise";
  const fullSummary = fullFromFeature ?? premiumPlan;
  const companion = companionFromFeature ?? true;

  let maxQuestions = fullSummary ? -1 : 5;
  const maxFeat =
    features["meeting.max_questions"] ??
    features["meeting_max_questions"] ??
    features["max_questions"];
  if (typeof maxFeat === "number") maxQuestions = maxFeat;
  else if (typeof maxFeat === "string" && maxFeat.trim()) {
    const n = Number(maxFeat);
    if (Number.isFinite(n)) maxQuestions = n;
  } else if (maxFeat && typeof maxFeat === "object" && "value" in (maxFeat as object)) {
    const n = Number((maxFeat as { value?: unknown }).value);
    if (Number.isFinite(n)) maxQuestions = n;
  }

  return {
    plan,
    entitlements: {
      "meeting.full_summary": fullSummary,
      "meeting.max_questions": maxQuestions,
      desktop_companion: companion,
    },
  };
}

async function keygateFetch<T>(
  path: string,
  init: {
    method?: string;
    body?: Record<string, unknown>;
    admin?: boolean;
    idempotencyKey?: string;
  } = {},
): Promise<{
  ok: boolean;
  httpStatus: number;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
}> {
  const url = `${keygateBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (init.admin) {
    const key = adminApiKey();
    if (!key) {
      return {
        ok: false,
        httpStatus: 503,
        errorCode: "KEYGATE_ADMIN_KEY_MISSING",
        errorMessage: "Keygate admin API key is not configured.",
      };
    }
    headers.Authorization = `Bearer ${key}`;
  }

  if (init.idempotencyKey) {
    headers["Idempotency-Key"] = init.idempotencyKey.slice(0, 256);
  }

  // Optional product scoping for admin calls
  const pid = productId();
  const body = init.body ? { ...init.body } : undefined;
  if (body && pid && init.admin && body.product_id === undefined) {
    body.product_id = pid;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method || "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error(
      "[keygate] network_error",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      httpStatus: 0,
      errorCode: "NETWORK_ERROR",
      errorMessage: "Unable to reach Keygate.",
    };
  }

  const json = (await response.json().catch(() => ({}))) as KeygateEnvelope<T>;
  if (!response.ok || json.success === false) {
    return {
      ok: false,
      httpStatus: response.status,
      errorCode: json.error?.code,
      errorMessage: json.error?.message,
      data: json.data,
    };
  }

  return {
    ok: true,
    httpStatus: response.status,
    data: json.data,
  };
}

export async function keygateActivate(input: {
  licenseKey: string;
  deviceId: string;
  label?: string;
}): Promise<{
  ok: boolean;
  state: KeygateMappedState;
  data?: KeygateActivateData;
  message: string;
}> {
  const result = await keygateFetch<KeygateActivateData>("/license/activate", {
    body: {
      license_key: input.licenseKey,
      identifier: input.deviceId,
      identifier_type: "device",
      label: input.label || "CueAI Desktop",
    },
    idempotencyKey: `act:${input.deviceId}:${hashHint(input.licenseKey)}`,
  });

  if (!result.ok) {
    const state = mapKeygateStatusToCueState(
      undefined,
      result.httpStatus,
      result.errorCode,
    );
    return {
      ok: false,
      state: result.httpStatus === 0 ? "NETWORK_ERROR" : state,
      message: userMessageForKeygateState(
        result.httpStatus === 0 ? "NETWORK_ERROR" : state,
      ),
    };
  }

  return {
    ok: true,
    state: "ACTIVE",
    data: result.data,
    message: "License activated.",
  };
}

export async function keygateVerify(input: {
  licenseKey: string;
  deviceId: string;
}): Promise<{
  ok: boolean;
  state: KeygateMappedState;
  data?: KeygateVerifyData;
  message: string;
}> {
  const result = await keygateFetch<KeygateVerifyData>("/license/verify", {
    body: {
      license_key: input.licenseKey,
      identifier: input.deviceId,
    },
  });

  if (!result.ok) {
    const state =
      result.httpStatus === 0
        ? "NETWORK_ERROR"
        : mapKeygateStatusToCueState(undefined, result.httpStatus, result.errorCode);
    return {
      ok: false,
      state,
      message: userMessageForKeygateState(state),
    };
  }

  const state = mapKeygateStatusToCueState(result.data?.status);
  return {
    ok: state === "ACTIVE",
    state,
    data: result.data,
    message: userMessageForKeygateState(state),
  };
}

export async function keygateDeactivate(input: {
  licenseKey: string;
  deviceId: string;
}): Promise<{ ok: boolean; state: KeygateMappedState; message: string }> {
  const result = await keygateFetch<{ ok?: boolean }>("/license/deactivate", {
    body: {
      license_key: input.licenseKey,
      identifier: input.deviceId,
    },
  });

  if (!result.ok && result.httpStatus !== 404) {
    const state =
      result.httpStatus === 0
        ? "NETWORK_ERROR"
        : mapKeygateStatusToCueState(undefined, result.httpStatus, result.errorCode);
    return {
      ok: false,
      state,
      message: userMessageForKeygateState(state),
    };
  }

  // 404 is treated as already-deactivated / unknown (oracle-hardened).
  return {
    ok: true,
    state: "NOT_ACTIVATED",
    message: "Device deactivated.",
  };
}

export async function keygateEntitlements(input: {
  licenseKey: string;
  feature?: string;
}): Promise<{
  ok: boolean;
  state: KeygateMappedState;
  planName?: string;
  features?: KeygateEntitlementFeatures;
  message: string;
}> {
  const body: Record<string, unknown> = { license_key: input.licenseKey };
  if (input.feature) body.feature = input.feature;

  const result = await keygateFetch<{
    licensed?: boolean;
    status?: string;
    plan_name?: string;
    features?: KeygateEntitlementFeatures;
  }>("/license/entitlements", { body });

  if (!result.ok) {
    const state =
      result.httpStatus === 0
        ? "NETWORK_ERROR"
        : mapKeygateStatusToCueState(result.data?.status, result.httpStatus, result.errorCode);
    return { ok: false, state, message: userMessageForKeygateState(state) };
  }

  const state = mapKeygateStatusToCueState(result.data?.status || "active");
  return {
    ok: Boolean(result.data?.licensed ?? state === "ACTIVE"),
    state,
    planName: result.data?.plan_name,
    features: result.data?.features,
    message: userMessageForKeygateState(state),
  };
}

/** Admin-only: create a license via Keygate (never call from desktop). */
export async function keygateAdminCreateLicense(input: {
  planId: string;
  customerEmail?: string;
  maxActivations?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; licenseKey?: string; licenseId?: string; message: string }> {
  const result = await keygateFetch<{
    id?: string;
    license_key?: string;
    key?: string;
  }>("/admin/licenses", {
    method: "POST",
    admin: true,
    body: {
      plan_id: input.planId,
      email: input.customerEmail,
      max_activations: input.maxActivations,
      metadata: input.metadata,
      product_id: productId(),
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.errorMessage || "Unable to create Keygate license.",
    };
  }

  return {
    ok: true,
    licenseId: result.data?.id,
    licenseKey: result.data?.license_key || result.data?.key,
    message: "License created.",
  };
}

/**
 * Admin-only: update license status (suspend / revoke / reactivate).
 * Used by Stripe billing sync — never expose admin key to clients.
 */
export async function keygateAdminSetLicenseStatus(input: {
  licenseId: string;
  status: "active" | "suspended" | "revoked" | "canceled" | "expired";
}): Promise<{ ok: boolean; message: string }> {
  if (!input.licenseId.trim()) {
    return { ok: false, message: "licenseId is required." };
  }
  const result = await keygateFetch<{ id?: string; status?: string }>(
    `/admin/licenses/${encodeURIComponent(input.licenseId.trim())}`,
    {
      method: "PATCH",
      admin: true,
      body: { status: input.status },
    },
  );
  if (!result.ok) {
    return {
      ok: false,
      message: result.errorMessage || "Unable to update Keygate license status.",
    };
  }
  return { ok: true, message: `License marked ${input.status}.` };
}

function hashHint(licenseKey: string): string {
  // Non-cryptographic short hint for idempotency only (not a secret store).
  let h = 0;
  const normalized = licenseKey.replace(/[\s-]/g, "").toUpperCase();
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
