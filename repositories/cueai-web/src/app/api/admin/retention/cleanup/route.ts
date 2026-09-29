import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { appendAudit, readStore, updateStore } from "@/lib/server/db";
import { runRetentionCleanup } from "@/lib/server/retention-cleanup";

/** Always-safe dry-run preview of retention candidates. */
export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("privacy.read", req);
  if (error || !session) return error;

  const store = await readStore();
  const result = await runRetentionCleanup(store, {
    dryRun: true,
    actorId: session.userId,
    actorName: session.name,
  });
  return NextResponse.json(result);
}

/**
 * POST body: { dryRun?: boolean }
 * Defaults to dryRun=true. Destructive execute requires env + autoDeleteEnabled.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requirePermission("retention.write", req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as { dryRun?: boolean } | null;
  const dryRun = body?.dryRun !== false;

  let result: Awaited<ReturnType<typeof runRetentionCleanup>> | null = null;

  if (dryRun) {
    const store = await readStore();
    result = await runRetentionCleanup(store, {
      dryRun: true,
      actorId: session.userId,
      actorName: session.name,
    });
    await updateStore(async (s) => {
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "retention.cleanup_preview",
        resourceType: "retention",
        metadata: { candidateCount: result!.candidates.length, dryRun: true },
      });
    });
  } else {
    await updateStore(async (s) => {
      result = await runRetentionCleanup(s, {
        dryRun: false,
        actorId: session.userId,
        actorName: session.name,
      });
    });
  }

  return NextResponse.json(result);
}
