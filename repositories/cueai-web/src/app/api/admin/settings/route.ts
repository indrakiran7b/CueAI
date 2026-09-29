import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireAuth } from "@/lib/server/api-auth";
import { appendAudit, updateStore } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  const { error } = await requirePermission("privacy.read", req);
  if (error) return error;
  const { readStore } = await import("@/lib/server/db");
  const store = await readStore();
  return NextResponse.json({
    privacy: store.workspace.privacy,
    retention: store.workspace.retention,
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | {
        privacy?: Partial<{
          shareTranscriptsWithTeam: boolean;
          allowAiTrainingOptIn: boolean;
          redactPiiInExports: boolean;
          requireInviteForJoin: boolean;
        }>;
        retention?: Partial<{
          meetingDays: number;
          transcriptDays: number;
          notesDays: number;
          resumeDays: number;
          knowledgeDays: number;
          autoDeleteEnabled: boolean;
        }>;
      }
    | null;

  if (body?.privacy) {
    const gate = await requirePermission("privacy.write", req);
    if (gate.error || !gate.session) return gate.error;
  }
  if (body?.retention) {
    const gate = await requirePermission("retention.write", req);
    if (gate.error || !gate.session) return gate.error;
  }
  if (!body?.privacy && !body?.retention) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { session } = await requireAuth(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = await updateStore(async (s) => {
    if (body?.privacy) {
      s.workspace.privacy = { ...s.workspace.privacy, ...body.privacy };
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "privacy.settings_changed",
        resourceType: "privacy",
        metadata: { ...body.privacy },
      });
    }
    if (body?.retention) {
      const next = { ...s.workspace.retention, ...body.retention };
      for (const key of [
        "meetingDays",
        "transcriptDays",
        "notesDays",
        "resumeDays",
        "knowledgeDays",
      ] as const) {
        if (typeof next[key] === "number") {
          next[key] = Math.min(3650, Math.max(1, Math.floor(next[key])));
        }
      }
      s.workspace.retention = next;
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "retention.settings_changed",
        resourceType: "retention",
        metadata: {
          ...body.retention,
          note: "Configuration saved. Automated purge is not executed yet.",
        },
      });
    }
  });

  return NextResponse.json({
    privacy: store.workspace.privacy,
    retention: store.workspace.retention,
  });
}
