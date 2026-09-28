import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { queryKnowledge } from "@/lib/server/rag/rag-service";

/**
 * POST /api/admin/knowledge/query
 * Grounded Knowledge Base Q&A (Admin/Manager with knowledge.read).
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requirePermission("knowledge.read", req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as {
    query?: string;
    top_k?: number;
    topK?: number;
  } | null;

  const query = String(body?.query || "").trim();
  if (!query) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "query is required." } },
      { status: 400 },
    );
  }

  try {
    const result = await queryKnowledge({
      workspaceId: session.workspaceId,
      query,
      topK: body?.topK ?? body?.top_k,
      userId: session.userId,
    });
    return NextResponse.json({
      ...result,
      knowledge_used: result.knowledgeUsed,
      source_type: result.sourceType,
      retrieval_method: result.retrievalMethod,
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "KNOWLEDGE_QUERY_FAILED",
          message: "Unable to query the Knowledge Base right now.",
        },
      },
      { status: 503 },
    );
  }
}
