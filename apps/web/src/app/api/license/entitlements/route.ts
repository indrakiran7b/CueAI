import { NextRequest } from "next/server";
import { jsonError } from "@/lib/server/api-auth";
import { getLicenseEntitlements } from "@/lib/server/licenses";

/**
 * GET/POST /api/license/entitlements
 * Desktop/web clients call CueAI — never Keygate directly.
 */
export async function GET(req: NextRequest) {
  const licenseId = req.nextUrl.searchParams.get("licenseId")?.trim() || "";
  const deviceId = req.nextUrl.searchParams.get("deviceId")?.trim() || "";
  if (!deviceId || deviceId.length < 8) {
    return jsonError("deviceId is required.", 400);
  }
  try {
    const result = await getLicenseEntitlements({
      licenseId: licenseId || undefined,
      deviceId,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[license] entitlements.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to load entitlements.", 500);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    licenseId?: string;
    licenseKey?: string;
    deviceId?: string;
  } | null;

  const deviceId = String(body?.deviceId || "").trim();
  if (!deviceId || deviceId.length < 8) {
    return jsonError("deviceId is required.", 400);
  }

  try {
    const result = await getLicenseEntitlements({
      licenseId: body?.licenseId ? String(body.licenseId).trim() : undefined,
      licenseKey: body?.licenseKey ? String(body.licenseKey).trim() : undefined,
      deviceId,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[license] entitlements.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to load entitlements.", 500);
  }
}
