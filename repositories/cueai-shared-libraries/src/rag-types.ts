export type KnowledgeDocStatus =
  | "uploaded"
  | "processing"
  | "indexed"
  | "failed"
  | "deleting";

export type KnowledgeSourceType =
  | "knowledge_base"
  | "meeting_knowledge"
  | "workspace_knowledge"
  | "general_ai";

/** How context was retrieved for this answer (diagnostics). */
export type RetrievalMethod = "semantic" | "keyword" | "none";

export type KnowledgeSource = {
  documentId: string;
  filename: string;
  category?: string | null;
  page?: number | null;
  section?: string | null;
  chunkId: string;
  score: number;
};

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  filename: string;
  text: string;
  score: number;
  page?: number | null;
  section?: string | null;
  chunkIndex: number;
  knowledgeScope?: "meeting" | "workspace";
  meetingId?: string | null;
  category?: string | null;
};

export type MeetingRetrieveResult = {
  chunks: RetrievedChunk[];
  knowledgeUsed: boolean;
  sourceType: KnowledgeSourceType;
  mode: "vector" | "keyword";
  retrievalMethod: RetrievalMethod;
  embeddingMs: number;
  retrievalMs: number;
  totalMs: number;
};

export type KnowledgeQueryResult = {
  answer: string;
  knowledgeUsed: boolean;
  sourceType: KnowledgeSourceType;
  sources: KnowledgeSource[];
  /** Primary retrieval path used for this answer. */
  retrievalMethod: RetrievalMethod;
  diagnostics?: {
    chunksRetrieved: number;
    retrievalMs: number;
    embeddingMs: number;
    llmMs: number;
    totalMs: number;
    mode: "vector" | "keyword";
    retrievalMethod: RetrievalMethod;
  };
};
