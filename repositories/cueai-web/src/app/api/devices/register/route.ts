import { NextRequest } from "next/server";
import { requireAuth, jsonError } from "@/lib/server/api-auth";
import { getDeviceForUser, registerDevice } from "@/lib/server/devices";

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as {
    device_id?: string;
    device_name?: string;
    platform?: string;
    app_version?: string;
    account_id?: string;
  } | null;

  // account_id from the renderer is ignored. Session user is authoritative.
  void body?.account_id;

  const deviceId = String(body?.device_id || "").trim();
  const deviceName = String(body?.device_name || "").trim() || "Mac";
  const platform = String(body?.platform || "macos").trim() || "macos";
  const appVersion = String(body?.app_version || "1.0.0").trim();

  if (!deviceId || deviceId.length < 8) {
    return jsonError("A valid device identifier is required.", 400);
  }

  const existing = await getDeviceForUser(session.userId, deviceId);
  if (existing?.status === "BLOCKED") {
    return jsonError("This Mac is blocked for this account.", 403);
  }
  if (existing?.status === "REVOKED") {
    return jsonError("This Mac is no longer authorized.", 403);
  }

  try {
    const { device, credential } = await registerDevice({
      userId: session.userId,
      actorName: session.name,
      deviceId,
      deviceName,
      platform,
      appVersion,
    });
    return Response.json({
      registered: true,
      device_id: device.deviceId,
      status: device.status,
      device_credential: credential,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Registration failed.", 500);
  }
}
