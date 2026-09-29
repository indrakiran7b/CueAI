import { NextRequest } from "next/server";
import { jsonError, requirePermission } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import {
  allowReplacementDevice,
  publicDevice,
  removeDevice,
  setDeviceStatus,
} from "@/lib/server/devices";

export async function GET(req: NextRequest) {
  const { error } = await requirePermission("devices.read", req);
  if (error) return error;

  const store = await readStore();
  const users = store.users;
  const devices = (store.devices || []).map((device) => {
    const user = users.find((u) => u.id === device.userId);
    return publicDevice(device, user?.email, user?.name);
  });
  return Response.json({ devices });
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requirePermission("devices.write", req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    userId?: string;
    action?: "activate" | "block" | "revoke" | "allow_replacement" | "delete";
  } | null;

  const action = body?.action;
  if (!action) return jsonError("action is required.", 400);

  if (action === "allow_replacement") {
    const userId = String(body?.userId || "").trim();
    if (!userId) return jsonError("userId is required.", 400);
    await allowReplacementDevice(userId, { id: session.userId, name: session.name });
    return Response.json({ ok: true });
  }

  const id = String(body?.id || "").trim();
  if (!id) return jsonError("id is required.", 400);

  if (action === "delete") {
    const removed = await removeDevice(id, { id: session.userId, name: session.name });
    if (!removed) return jsonError("Device not found.", 404);
    return Response.json({ ok: true, deleted: true });
  }

  const status =
    action === "activate" ? "ACTIVE" : action === "block" ? "BLOCKED" : action === "revoke" ? "REVOKED" : null;
  if (!status) return jsonError("Unknown action.", 400);

  const device = await setDeviceStatus(id, status, { id: session.userId, name: session.name });
  if (!device) return jsonError("Device not found.", 404);
  return Response.json({ ok: true, device: publicDevice(device) });
}
