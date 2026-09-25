/**
 * Lightweight Knowledge Base retrieval for live interview answers.
 * Returns only relevant chunks — never the full KB.
 */

import { readStore, type DbKnowledge } from "@/lib/server/db";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreDoc(queryTokens: string[], doc: DbKnowledge): number {
  if (doc.status === "failed") return 0;
  const hay = `${doc.title}\n${doc.content}`.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (hay.includes(t)) score += t.length > 5 ? 2 : 1;
  }
  if (queryTokens.some((t) => doc.title.toLowerCase().includes(t))) score += 3;
  return score;
}

function excerpt(content: string, queryTokens: string[], maxChars: number): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;

  const lower = text.toLowerCase();
  let best = 0;
  for (const t of queryTokens) {
    const idx = lower.indexOf(t);
    if (idx >= 0) {
      best = Math.max(0, idx - 80);
      break;
    }
  }
  return text.slice(best, best + maxChars).trim();
}

/**
 * Retrieve up to `limit` relevant KB chunks for a question.
 */
export async function retrieveKnowledgeForQuestion(
  question: string,
  opts?: { workspaceId?: string | null; limit?: number; maxChars?: number },
): Promise<string> {
  const q = question.trim();
  if (!q) return "";

  const limit = opts?.limit ?? 3;
  const maxChars = opts?.maxChars ?? 900;
  const tokens = tokenize(q);
  if (!tokens.length) return "";

  try {
    const store = await readStore();
    const docs = store.knowledge.filter((d) => {
      if (!d.content?.trim() && !d.title?.trim()) return false;
      if (opts?.workspaceId && d.workspaceId && d.workspaceId !== opts.workspaceId) {
        return false;
      }
      return true;
    });

    const ranked = docs
      .map((doc) => ({ doc, score: scoreDoc(tokens, doc) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (!ranked.length) return "";

    return ranked
      .map(({ doc }) => {
        const body = excerpt(doc.content || "", tokens, maxChars);
        return `Document: ${doc.title}\n${body || "(title match only)"}`;
      })
      .join("\n\n---\n\n")
      .slice(0, 2800);
  } catch {
    return "";
  }
}
