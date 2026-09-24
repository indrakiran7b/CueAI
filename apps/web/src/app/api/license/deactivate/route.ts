import { NextRequest } from "next/server";
import { jsonError } from "@/lib/server/api-auth";
import { deactivateLicense } from "@/lib/server/licenses";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    licenseId?: string;
    deviceId?: string;
  } | null;

  const licenseId = String(body?.licenseId || "").trim();
  const deviceId = String(body?.deviceId || "").trim();

  if (!licenseId) return jsonError("licenseId is required.", 400);
  if (!deviceId || deviceId.length < 8) return jsonError("A valid device identifier is required.", 400);

  try {
    const result = await deactivateLicense({ licenseId, deviceId });
    return Response.json(result);
  } catch (err) {
    console.error("[license] deactivate.error", err instanceof Error ? err.message : err);
    return jsonError("Unable to deactivate license.", 500);
  }
}
