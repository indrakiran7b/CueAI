import { NextRequest } from "next/server";
import { jsonError } from "@/lib/server/api-auth";
import { validateLicense } from "@/lib/server/licenses";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    licenseKey?: string;
    licenseId?: string;
    deviceId?: string;
    platform?: string;
    appVersion?: string;
  } | null;

  const deviceId = String(body?.deviceId || "").trim();
  const platformRaw = String(body?.platform || "").trim().toLowerCase();
  const platform = platformRaw === "macos" ? "macos" : platformRaw === "windows" ? "windows" : null;

  if (!deviceId || deviceId.length < 8) {
    return jsonError("A valid device identifier is required.", 400);
  }
  if (!platform) {
    return jsonError("Platform must be windows or macos.", 400);
  }

  const licenseKey = body?.licenseKey ? String(body.licenseKey).trim() : undefined;
  const licenseId = body?.licenseId ? String(body.licenseId).trim() : undefined;
  if (!licenseKey && !licenseId) {
    return jsonError("licenseKey or licenseId is required.", 400);
  }

  try {
    const result = await validateLicense({
      licenseKey,
      licenseId,
      deviceId,
      platform,
      appVersion: body?.appVersion ? String(body.appVersion).trim() : undefined,
    });
    const status =
      result.state === "INVALID"
        ? 404
        : result.state === "NOT_ACTIVATED"
          ? 403
          : result.state === "EXPIRED" ||
              result.state === "REVOKED" ||
              result.state === "SUSPENDED"
            ? 403
            : result.state === "DEVICE_LIMIT_REACHED"
              ? 409
              : result.valid
                ? 200
                : 400;
    return Response.json(result, { status });
  } catch (err) {
    console.error("[license] validate.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to validate license.", 500);
  }
}
