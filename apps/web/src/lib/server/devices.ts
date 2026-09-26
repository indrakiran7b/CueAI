import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { appendAudit, readStore, updateStore, type DbDevice, type DeviceStatus } from "@/lib/server/db";

export function maskDeviceId(deviceId: string) {
  const id = deviceId.replace(/[^a-zA-Z0-9]/g, "");
  const tail = id.slice(-4).toUpperCase() || "----";
  return `MAC-••••••••${tail}`;
}

export function hashDeviceCredential(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateDeviceCredential() {
  return randomBytes(32).toString("hex");
}

export function credentialMatches(token: string, hash: string) {
  const a = Buffer.from(hashDeviceCredential(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicDevice(device: DbDevice, userEmail?: string, userName?: string) {
  return {
    id: device.id,
    deviceId: maskDeviceId(device.deviceId),
    deviceName: device.deviceName,
    platform: device.platform,
    appVersion: device.appVersion,
    status: device.status,
    registeredAt: device.registeredAt,
    lastVerifiedAt: device.lastVerifiedAt || null,
    updatedAt: device.updatedAt || null,
    revokedAt: device.revokedAt || null,
    blockedAt: device.blockedAt || null,
    userId: device.userId,
    userEmail: userEmail || null,
    userName: userName || null,
  };
}

export async function getDeviceForUser(userId: string, deviceId: string) {
  const store = await readStore();
  const devices = store.devices || [];
  return devices.find((d) => d.userId === userId && d.deviceId === deviceId) || null;
}

export async function registerDevice(input: {
  userId: string;
  actorName: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
}): Promise<{ device: DbDevice; created: boolean; credential: string }> {
  const now = new Date().toISOString();
  const credential = generateDeviceCredential();
  const credentialHash = hashDeviceCredential(credential);
  let created = false;
  let recordId = "";

  const store = await updateStore(async (s) => {
    if (!s.devices) s.devices = [];
    const existing = s.devices.find((d) => d.userId === input.userId && d.deviceId === input.deviceId);
    if (existing) {
      recordId = existing.id;
      if (existing.status === "BLOCKED" || existing.status === "REVOKED") {
        return;
      }
      existing.deviceName = input.deviceName.slice(0, 80);
      existing.platform = input.platform.slice(0, 32);
      existing.appVersion = input.appVersion.slice(0, 32);
      existing.status = "ACTIVE";
      existing.lastVerifiedAt = now;
      existing.updatedAt = now;
      existing.credentialHash = credentialHash;
      return;
    }

    created = true;
    const device: DbDevice = {
      id: `dev_${randomUUID().slice(0, 10)}`,
      userId: input.userId,
      deviceId: input.deviceId,
      deviceName: input.deviceName.slice(0, 80),
      platform: input.platform.slice(0, 32),
      appVersion: input.appVersion.slice(0, 32),
      status: "ACTIVE",
      registeredAt: now,
      lastVerifiedAt: now,
      updatedAt: now,
      credentialHash,
    };
    s.devices.push(device);
    recordId = device.id;
    await appendAudit(s, {
      actorId: input.userId,
      actorName: input.actorName,
      action: "device.registered",
      resourceType: "device",
      resourceId: device.id,
      metadata: { platform: device.platform, appVersion: device.appVersion },
    });
  });

  const device = (store.devices || []).find((d) => d.id === recordId);
  if (!device) {
    throw new Error("Could not persist device registration.");
  }
  if (device.status === "BLOCKED" || device.status === "REVOKED") {
    throw new Error(
      device.status === "BLOCKED"
        ? "This Mac is blocked for this account."
        : "This Mac is no longer authorized.",
    );
  }
  return { device, created, credential };
}

export async function verifyDeviceStatus(userId: string, deviceId: string): Promise<DeviceStatus> {
  const result = await verifyDeviceForAccount(userId, deviceId);
  return result.status;
}

export async function verifyDeviceForAccount(
  userId: string,
  deviceId: string,
  credential?: string | null,
): Promise<{ status: DeviceStatus; authorized: boolean }> {
  const device = await getDeviceForUser(userId, deviceId);
  if (!device) return { status: "NEW", authorized: false };

  let credentialValid = true;
  if (device.credentialHash) {
    credentialValid = Boolean(credential && credentialMatches(credential, device.credentialHash));
  }

  if (device.status === "ACTIVE" && credentialValid) {
    await updateStore((s) => {
      const row = (s.devices || []).find((d) => d.id === device.id);
      if (row) {
        const now = new Date().toISOString();
        row.lastVerifiedAt = now;
        row.updatedAt = now;
      }
    });
  }

  return {
    status: device.status,
    authorized: device.status === "ACTIVE" && credentialValid,
  };
}

export async function setDeviceStatus(
  recordId: string,
  status: "ACTIVE" | "BLOCKED" | "REVOKED",
  actor: { id: string; name: string },
) {
  const now = new Date().toISOString();
  const store = await updateStore(async (s) => {
    if (!s.devices) s.devices = [];
    const device = s.devices.find((d) => d.id === recordId);
    if (!device) return;
    device.status = status;
    device.updatedAt = now;
    if (status === "BLOCKED") device.blockedAt = now;
    if (status === "REVOKED") device.revokedAt = now;
    if (status === "ACTIVE") {
      device.blockedAt = undefined;
      device.revokedAt = undefined;
      device.lastVerifiedAt = now;
    }
    await appendAudit(s, {
      actorId: actor.id,
      actorName: actor.name,
      action: `device.${status.toLowerCase()}`,
      resourceType: "device",
      resourceId: device.id,
      metadata: { userId: device.userId },
    });
  });
  return (store.devices || []).find((d) => d.id === recordId) || null;
}

export async function removeDevice(recordId: string, actor: { id: string; name: string }) {
  let removed = false;
  await updateStore(async (s) => {
    if (!s.devices) s.devices = [];
    const device = s.devices.find((d) => d.id === recordId);
    if (!device) return;
    s.devices = s.devices.filter((d) => d.id !== recordId);
    removed = true;
    await appendAudit(s, {
      actorId: actor.id,
      actorName: actor.name,
      action: "device.deleted",
      resourceType: "device",
      resourceId: device.id,
      metadata: { userId: device.userId, deviceName: device.deviceName },
    });
  });
  return removed;
}

export async function allowReplacementDevice(userId: string, actor: { id: string; name: string }) {
  const now = new Date().toISOString();
  await updateStore(async (s) => {
    if (!s.devices) s.devices = [];
    for (const device of s.devices) {
      if (device.userId !== userId) continue;
      if (device.status === "ACTIVE" || device.status === "PENDING") {
        device.status = "REVOKED";
        device.revokedAt = now;
        device.updatedAt = now;
      }
    }
    await appendAudit(s, {
      actorId: actor.id,
      actorName: actor.name,
      action: "device.allow_replacement",
      resourceType: "device",
      resourceId: userId,
    });
  });
}
