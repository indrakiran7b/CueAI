import { appendUsage, updateStore, type DbUsageEvent } from "@/lib/server/db";
import type { SessionPayload } from "@/lib/server/session";

export async function recordUsageEvent(
  session: SessionPayload | null | undefined,
  entry: {
    type: DbUsageEvent["type"];
    quantity: number;
    inputTokens?: number;
    outputTokens?: number;
    provider?: string;
    model?: string;
    metadata?: Record<string, string | number | boolean>;
    /** When set, duplicate deliveries with the same key+type+user are ignored. */
    idempotencyKey?: string;
  },
) {
  if (!session) return { recorded: false as const, reason: "no_session" as const };

  let recorded = false;
  let duplicate = false;

  await updateStore(async (s) => {
    if (entry.idempotencyKey) {
      const exists = s.usage.some(
        (u) =>
          u.workspaceId === session.workspaceId &&
          u.userId === session.userId &&
          u.type === entry.type &&
          u.metadata?.idempotencyKey === entry.idempotencyKey,
      );
      if (exists) {
        duplicate = true;
        return;
      }
    }

    await appendUsage(s, {
      userId: session.userId,
      userName: session.name,
      type: entry.type,
      quantity: entry.quantity,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      provider: entry.provider,
      model: entry.model,
      metadata: {
        ...(entry.metadata || {}),
        ...(entry.idempotencyKey ? { idempotencyKey: entry.idempotencyKey } : {}),
      },
      workspaceId: session.workspaceId,
    });
    recorded = true;
  });

  return { recorded, duplicate };
}
