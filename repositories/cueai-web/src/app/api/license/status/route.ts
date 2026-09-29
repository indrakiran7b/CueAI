import { NextRequest } from "next/server";
import { jsonError } from "@/lib/server/api-auth";
import { getLicenseStatus } from "@/lib/server/licenses";

export async function GET(req: NextRequest) {
  const licenseId = req.nextUrl.searchParams.get("licenseId")?.trim() || "";
  const deviceId = req.nextUrl.searchParams.get("deviceId")?.trim() || "";
  const platformRaw = req.nextUrl.searchParams.get("platform")?.trim().toLowerCase() || "";
  const platform = platformRaw === "macos" ? "macos" : platformRaw === "windows" ? "windows" : null;

  if (!licenseId) return jsonError("licenseId is required.", 400);
  if (!deviceId || deviceId.length < 8) return jsonError("deviceId is required.", 400);
  if (!platform) return jsonError("platform must be windows or macos.", 400);

  try {
    const result = await getLicenseStatus({ licenseId, deviceId, platform });
    return Response.json(result);
  } catch (err) {
    console.error("[license] status.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to read license status.", 500);
  }
}
