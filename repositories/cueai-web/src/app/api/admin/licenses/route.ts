import { NextRequest } from "next/server";
import { requirePermission, jsonError } from "@/lib/server/api-auth";
import { appendAudit, updateStore } from "@/lib/server/db";
import { generateLicense, revokeLicense } from "@/lib/server/licenses";
import { readLicenseStore } from "@/lib/server/license-db";
import { isLicenseSigningConfigured } from "@/lib/server/license-crypto";
import type { LicenseType } from "@/lib/server/license-db";

function maskDeviceId(deviceId: string): string {
  const clean = deviceId.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length <= 8) return `${clean.slice(0, 4)}…`;
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const { error } = await requirePermission("licenses.read", req);
  if (error) return error;

  const store = await readLicenseStore();
  const signing = isLicenseSigningConfigured();
  const graceHours = Math.max(
    1,
    Math.min(168, Number(process.env.LICENSE_OFFLINE_GRACE_HOURS || "72") || 72),
  );

  return Response.json({
    config: {
      signingReady: signing.ready,
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
      offlineGraceHours: graceHours,
      enforcement: process.env.LICENSE_ENFORCEMENT === "true",
    },
    licenses: store.licenses.map((l) => ({
      id: l.id,
      licenseType: l.licenseType,
      clientName: l.clientName,
      status: l.status,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      maxDevices: l.maxDevices,
      activeDevices: store.activations.filter((a) => a.licenseId === l.id && a.status === "ACTIVE")
        .length,
      activations: store.activations
        .filter((a) => a.licenseId === l.id)
        .map((a) => ({
          id: a.id,
          deviceId: maskDeviceId(a.deviceId),
          platform: a.platform,
          appVersion: a.appVersion,
          status: a.status,
          activatedAt: a.activatedAt,
          lastSeenAt: a.lastSeenAt,
          deactivatedAt: a.deactivatedAt,
        })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requirePermission("licenses.write", req);
  if (error || !session) return error;

  const signing = isLicenseSigningConfigured();
  if (!signing.ready) {
    return jsonError(
      "License signing is not configured. Run npm run generate:license-keys and add LICENSE_SIGNING_PRIVATE_KEY and LICENSE_SIGNING_PUBLIC_KEY to apps/web/.env.local.",
      503,
    );
  }

  const body = (await req.json().catch(() => null)) as {
    clientName?: string;
    type?: LicenseType;
    expiresAt?: string;
    maxDevices?: number;
    days?: number;
  } | null;

  const clientName = String(body?.clientName || "").trim();
  const type = body?.type === "CLIENT_TESTING" ? "CLIENT_TESTING" : null;
  let expiresAt = String(body?.expiresAt || "").trim();
  const maxDevices = Number(body?.maxDevices ?? 2);

  if (!clientName) return jsonError("clientName is required.", 400);
  if (!type) return jsonError("type must be CLIENT_TESTING.", 400);

  if (!expiresAt && typeof body?.days === "number" && body.days > 0) {
    expiresAt = new Date(Date.now() + body.days * 86400_000).toISOString();
  }
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
    return jsonError("expiresAt must be a valid ISO date (or provide days).", 400);
  }

  try {
    const { license, licenseKey } = await generateLicense({
      clientName,
      type,
      expiresAt,
      maxDevices,
    });

    await updateStore(async (s) => {
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "license.generated",
        resourceType: "license",
        resourceId: license.id,
        metadata: {
          clientName: license.clientName,
          expiresAt: license.expiresAt,
          maxDevices: license.maxDevices,
        },
      });
    });

    return Response.json({
      license: {
        id: license.id,
        licenseType: license.licenseType,
        clientName: license.clientName,
        status: license.status,
        expiresAt: license.expiresAt,
        maxDevices: license.maxDevices,
      },
      licenseKey,
    });
  } catch (err) {
    console.error("[license] admin.generate.error", err instanceof Error ? err.message : err);
    return jsonError(err instanceof Error ? err.message : "Failed to generate license.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requirePermission("licenses.write", req);
  if (error || !session) return error;

  const licenseId = req.nextUrl.searchParams.get("licenseId")?.trim() || "";
  if (!licenseId) return jsonError("licenseId is required.", 400);

  const store = await readLicenseStore();
  const license = store.licenses.find((l) => l.id === licenseId);
  if (!license) return jsonError("License not found.", 404);

  const ok = await revokeLicense(licenseId);
  if (!ok) return jsonError("License not found.", 404);

  await updateStore(async (s) => {
    await appendAudit(s, {
      actorId: session.userId,
      actorName: session.name,
      action: "license.revoked",
      resourceType: "license",
      resourceId: licenseId,
      metadata: { clientName: license.clientName },
    });
  });

  return Response.json({ revoked: true, licenseId });
}
