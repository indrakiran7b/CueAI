import { NextRequest, NextResponse } from "next/server";
import { exchangeDesktopGoogleHandoff } from "@/lib/server/desktop-google-handoff";
import { publicUser, readStore } from "@/lib/server/db";
import { registerDevice } from "@/lib/server/devices";
import { normalizeRole, permissionsFor } from "@/lib/roles";
import { signSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    state?: string;
    code?: string;
    verifier?: string;
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    appVersion?: string;
  } | null;

  const exchanged = await exchangeDesktopGoogleHandoff({
    state: body?.state || "",
    code: body?.code || "",
    verifier: body?.verifier || "",
    deviceId: body?.deviceId || "",
  });
  if (!exchanged.ok) {
    return NextResponse.json({ error: exchanged.error, code: exchanged.code }, { status: exchanged.status });
  }

  const store = await readStore();
  const user = store.users.find((u) => u.id === exchanged.userId);
  if (!user || user.status === "Deactivated") {
    return NextResponse.json({ error: "Account unavailable.", code: "account_unavailable" }, { status: 403 });
  }

  try {
    const { device, credential } = await registerDevice({
      userId: user.id,
      actorName: user.name,
      deviceId: String(body?.deviceId || "").trim(),
      deviceName: String(body?.deviceName || "").trim() || (exchanged.platform === "macos" ? "Mac" : "Windows"),
      platform: exchanged.platform,
      appVersion: String(body?.appVersion || "1.0.0").trim(),
    });

    const sessionToken = signSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: normalizeRole(user.role),
      workspaceId: user.workspaceId || store.workspace.id,
      workspace: store.workspace.name,
    });

    return NextResponse.json({
      ok: true,
      sessionToken,
      device_credential: credential,
      device_id: device.deviceId,
      status: device.status,
      dashboardPath: exchanged.platform === "macos" ? "/dashboard?desktop=mac" : "/dashboard",
      user: {
        ...publicUser(user),
        role: normalizeRole(user.role),
        workspace: store.workspace.name,
        workspaceId: user.workspaceId || store.workspace.id,
      },
      permissions: permissionsFor(normalizeRole(user.role)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Device registration failed.";
    const blocked = /block/i.test(message);
    const revoked = /authoriz/i.test(message) || /revok/i.test(message);
    return NextResponse.json(
      { error: message, code: blocked ? "blocked" : revoked ? "revoked" : "register_failed" },
      { status: blocked || revoked ? 403 : 500 },
    );
  }
}
