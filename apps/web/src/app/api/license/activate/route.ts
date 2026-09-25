import { NextRequest } from "next/server";
import { jsonError } from "@/lib/server/api-auth";
import { activateLicense } from "@/lib/server/licenses";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    licenseKey?: string;
    deviceId?: string;
    platform?: string;
    appVersion?: string;
  } | null;

  const licenseKey = String(body?.licenseKey || "").trim();
  const deviceId = String(body?.deviceId || "").trim();
  const platformRaw = String(body?.platform || "").trim().toLowerCase();
  const platform = platformRaw === "macos" ? "macos" : platformRaw === "windows" ? "windows" : null;
  const appVersion = String(body?.appVersion || "1.0.0").trim();

  if (!licenseKey || licenseKey.length < 12) {
    return jsonError("A valid license key is required.", 400);
  }
  if (!deviceId || deviceId.length < 8) {
    return jsonError("A valid device identifier is required.", 400);
  }
  if (!platform) {
    return jsonError("Platform must be windows or macos.", 400);
  }

  try {
    const result = await activateLicense({ licenseKey, deviceId, platform, appVersion });
    const status =
      result.state === "INVALID"
        ? 404
        : result.state === "EXPIRED"
          ? 403
          : result.state === "REVOKED"
            ? 403
            : result.state === "DEVICE_LIMIT_REACHED"
              ? 409
              : result.valid
                ? 200
                : 400;
    return Response.json(result, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unable to activate license.";
    console.error("[license] activate.error", msg);
    if (msg.includes("LICENSE_SIGNING_PRIVATE_KEY")) {
      return jsonError("Licensing is not configured on the server.", 503);
    }
    return jsonError("Unable to activate license.", 500);
  }
}
