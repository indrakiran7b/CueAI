import { NextRequest, NextResponse } from "next/server";
import { proxyToFastApi } from "@/lib/server/fastapi-proxy";
import { requireAuth } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  const proxied = await proxyToFastApi(req, "/v1/workspaces");
  if (proxied) return proxied;

  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const store = await readStore();
  const id = session.workspaceId || store.workspace.id;
  const name = store.workspace.name || session.workspace;
  return NextResponse.json({
    workspaces: [
      {
        id,
        name,
        current: true,
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  const proxied = await proxyToFastApi(req, "/v1/workspaces");
  if (proxied) return proxied;

  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const body = (await req.json().catch(() => null)) as { workspaceId?: string } | null;
  const requested = String(body?.workspaceId || "").trim();
  if (!requested || requested !== session.workspaceId) {
    return NextResponse.json(
      { error: "You can only use workspaces you belong to." },
      { status: 403 },
    );
  }
  return NextResponse.json({
    ok: true,
    workspaceId: session.workspaceId,
    workspace: session.workspace,
  });
}
