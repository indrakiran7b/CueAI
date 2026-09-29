import type { WorkspaceStore, DbKnowledge } from "@/lib/server/db";
import { appendAudit } from "@/lib/server/db";

export type RetentionCandidate = {
  resourceType: "knowledge" | "usage_note";
  resourceId: string;
  title?: string;
  ageDays: number;
  retentionDays: number;
  reason: string;
};

export type RetentionCleanupResult = {
  dryRun: boolean;
  executed: boolean;
  blockedReason?: string;
  workspaceId: string;
  candidates: RetentionCandidate[];
  deleted: { resourceType: string; resourceId: string }[];
  preserved: string[];
};

/** Absolute floor — never delete data newer than this many days, regardless of settings. */
export const RETENTION_MIN_AGE_DAYS = 7;

function ageDays(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function canExecuteDestructiveCleanup() {
  if (process.env.RETENTION_CLEANUP_ENABLED !== "true") return false;
  // Never auto-run destructive deletes in development unless explicitly allowed.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.RETENTION_CLEANUP_ALLOW_DEV !== "true"
  ) {
    return false;
  }
  return true;
}

/**
 * Identify expired workspace content eligible for cleanup.
 * Does NOT consider audit logs or billing usage as deletable.
 */
export function findRetentionCandidates(store: WorkspaceStore): RetentionCandidate[] {
  const { retention } = store.workspace;
  const knowledgeDays = Math.max(RETENTION_MIN_AGE_DAYS, retention.knowledgeDays || 365);
  const candidates: RetentionCandidate[] = [];

  for (const item of store.knowledge) {
    const stamped = item.updatedAt || item.createdAt;
    const age = ageDays(stamped);
    if (age >= knowledgeDays && age >= RETENTION_MIN_AGE_DAYS) {
      candidates.push({
        resourceType: "knowledge",
        resourceId: item.id,
        title: item.title,
        ageDays: age,
        retentionDays: knowledgeDays,
        reason: `Knowledge older than ${knowledgeDays} days`,
      });
    }
  }

  // Meetings / transcripts / resume blobs are not yet server-persisted in this store.
  // When they are, add age checks against retention.meetingDays / transcriptDays / resumeDays
  // with the same RETENTION_MIN_AGE_DAYS floor.

  return candidates;
}

/**
 * Safe cleanup runner.
 * - dryRun=true (default): report only
 * - execute requires RETENTION_CLEANUP_ENABLED + autoDeleteEnabled + non-dev (unless ALLOW_DEV)
 * - Never deletes audit or usage records
 */
export async function runRetentionCleanup(
  store: WorkspaceStore,
  opts: {
    dryRun?: boolean;
    actorId: string;
    actorName: string;
  },
): Promise<RetentionCleanupResult> {
  const dryRun = opts.dryRun !== false;
  const candidates = findRetentionCandidates(store);
  const preserved = [
    "audit (compliance — never deleted by retention job)",
    "usage (billing-ready — never deleted by retention job)",
    "active users",
    `items younger than ${RETENTION_MIN_AGE_DAYS} days (safety floor)`,
  ];

  const base: RetentionCleanupResult = {
    dryRun,
    executed: false,
    workspaceId: store.workspace.id,
    candidates,
    deleted: [],
    preserved,
  };

  if (dryRun) {
    return base;
  }

  if (!store.workspace.retention.autoDeleteEnabled) {
    return {
      ...base,
      blockedReason: "Workspace autoDeleteEnabled is false. Enable it in Data Retention settings first.",
    };
  }

  if (!canExecuteDestructiveCleanup()) {
    return {
      ...base,
      blockedReason:
        "Destructive cleanup is disabled. Set RETENTION_CLEANUP_ENABLED=true and run in production (or RETENTION_CLEANUP_ALLOW_DEV=true for explicit non-prod tests).",
    };
  }

  const deleteIds = new Set(
    candidates.filter((c) => c.resourceType === "knowledge").map((c) => c.resourceId),
  );
  const before = store.knowledge.length;
  store.knowledge = store.knowledge.filter((k: DbKnowledge) => !deleteIds.has(k.id));
  const removed = before - store.knowledge.length;

  for (const id of deleteIds) {
    base.deleted.push({ resourceType: "knowledge", resourceId: id });
  }

  await appendAudit(store, {
    actorId: opts.actorId,
    actorName: opts.actorName,
    action: "retention.cleanup_executed",
    resourceType: "retention",
    metadata: {
      deletedCount: removed,
      candidateCount: candidates.length,
      dryRun: false,
    },
  });

  return { ...base, executed: true, dryRun: false };
}
