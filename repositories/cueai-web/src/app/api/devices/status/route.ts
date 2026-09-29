import { NextRequest } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import { publicDevice, verifyDeviceForAccount, getDeviceForUser } from "@/lib/server/devices";

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const deviceId = req.nextUrl.searchParams.get("device_id")?.trim() || "";
  if (!deviceId) {
    return jsonError("device_id is required.", 400);
  }

  const credential =
    req.headers.get("x-cueai-device-credential")?.trim() ||
    req.headers.get("X-CueAI-Device-Credential")?.trim() ||
    "";

  try {
    const result = await verifyDeviceForAccount(session.userId, deviceId, credential || null);
    const device = result.status === "NEW" ? null : await getDeviceForUser(session.userId, deviceId);
    return Response.json({
      status: result.status,
      authorized: result.authorized,
      device: device ? publicDevice(device, session.email, session.name) : null,
    });
  } catch {
    return jsonError("Could not verify this Mac. Try again when you are online.", 503);
  }
}
