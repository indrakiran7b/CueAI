/**
 * Lightweight Knowledge Base retrieval for live interview answers.
 * Meeting-first RAG with workspace fallback.
 */

import { retrieveKnowledgeContextForLive } from "./rag/rag-service";
import type { KnowledgeSource, KnowledgeSourceType } from "@cueai/shared-libraries/rag-types";

export type LiveKnowledgeResult = {
  context: string;
  knowledgeUsed: boolean;
  sourceType: KnowledgeSourceType;
  sources: KnowledgeSource[];
  retrievalMs: number;
};

export async function retrieveKnowledgeForQuestion(
  question: string,
  opts?: {
    workspaceId?: string | null;
    meetingId?: string | null;
    documentIds?: string[];
    includeWorkspace?: boolean;
    limit?: number;
    maxChars?: number;
  },
): Promise<string> {
  const result = await retrieveKnowledgeForMeeting(question, opts);
  return result.context;
}

export async function retrieveKnowledgeForMeeting(
  question: string,
  opts?: {
    workspaceId?: string | null;
    meetingId?: string | null;
    documentIds?: string[];
    includeWorkspace?: boolean;
    maxChars?: number;
  },
): Promise<LiveKnowledgeResult> {
  const q = question.trim();
  if (!q) {
    return {
      context: "",
      knowledgeUsed: false,
      sourceType: "general_ai",
      sources: [],
      retrievalMs: 0,
    };
  }
  try {
    return await retrieveKnowledgeContextForLive(q, {
      workspaceId: opts?.workspaceId,
      meetingId: opts?.meetingId,
      documentIds: opts?.documentIds,
      includeWorkspace: opts?.includeWorkspace,
      maxChars: opts?.maxChars ?? 2800,
    });
  } catch {
    return {
      context: "",
      knowledgeUsed: false,
      sourceType: "general_ai",
      sources: [],
      retrievalMs: 0,
    };
  }
}
