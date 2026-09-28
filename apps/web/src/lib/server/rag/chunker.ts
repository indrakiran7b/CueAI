/**
 * Semantic-aware text chunking with overlap.
 */

import { ragConfig } from "@/lib/server/rag/config";

export type TextChunk = {
  index: number;
  text: string;
  tokenCount: number;
  sectionTitle?: string;
  pageNumber?: number;
};

function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3));
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function isHeading(line: string): boolean {
  if (/^#{1,6}\s+\S/.test(line)) return true;
  if (/^[A-Z][A-Z0-9 /&-]{8,80}$/.test(line.trim())) return true;
  return false;
}

/**
 * Chunk on paragraphs/headings with token-budget overlap.
 */
export function chunkDocument(raw: string, opts?: { size?: number; overlap?: number }): TextChunk[] {
  const cfg = ragConfig();
  const size = opts?.size ?? cfg.chunkSize;
  const overlap = opts?.overlap ?? cfg.chunkOverlap;
  const text = normalizeText(raw);
  if (!text) return [];

  const paragraphs = splitParagraphs(text);
  const chunks: TextChunk[] = [];
  let buffer = "";
  let sectionTitle: string | undefined;
  let pageNumber: number | undefined;

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) return;
    const pagesInChunk = [...trimmed.matchAll(/\[Page\s+(\d+)\]/gi)].map((m) =>
      Number(m[1]),
    );
    const chunkPage =
      pagesInChunk.length > 0 ? Math.min(...pagesInChunk) : pageNumber;
    chunks.push({
      index: chunks.length,
      text: trimmed,
      tokenCount: approxTokens(trimmed),
      sectionTitle,
      pageNumber: chunkPage,
    });
  };

  for (const para of paragraphs) {
    const firstLine = para.split("\n")[0] || "";
    if (isHeading(firstLine)) {
      sectionTitle = firstLine.replace(/^#+\s*/, "").trim();
    }
    const pageMatch = para.match(/\[Page\s+(\d+)\]/i);
    if (pageMatch) pageNumber = Number(pageMatch[1]);

    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (approxTokens(candidate) <= size) {
      buffer = candidate;
      continue;
    }

    if (buffer) flush();

    if (approxTokens(para) <= size) {
      buffer = para;
      continue;
    }

    // Sentence fallback for oversized paragraphs.
    const sentences = para.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [para];
    buffer = "";
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      if (approxTokens(trimmedSentence) > size) {
        if (buffer) {
          flush();
          buffer = "";
        }
        // Token/word boundary fallback when a single sentence exceeds the budget.
        const words = trimmedSentence.split(/\s+/);
        let window: string[] = [];
        for (const word of words) {
          const next = [...window, word];
          if (approxTokens(next.join(" ")) > size && window.length) {
            buffer = window.join(" ");
            flush();
            const keep = Math.max(1, Math.floor(window.length * (overlap / size)));
            window = [...window.slice(-keep), word];
          } else {
            window = next;
          }
        }
        buffer = window.join(" ");
        continue;
      }
      const next = buffer ? `${buffer} ${trimmedSentence}` : trimmedSentence;
      if (approxTokens(next) > size && buffer) {
        flush();
        const words = buffer.split(/\s+/);
        const keep = Math.max(1, Math.floor(words.length * (overlap / size)));
        buffer = words.slice(-keep).join(" ");
        buffer = buffer ? `${buffer} ${trimmedSentence}` : trimmedSentence;
      } else {
        buffer = next;
      }
    }
  }

  flush();
  return chunks;
}
