import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import {
  looksLikePdfBinary,
  sanitizeExtractedText,
} from "@/lib/server/extract-document";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/knowledge/:id/content
 * Returns structured extracted text pages — never raw PDF bytes.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requirePermission("knowledge.read", req);
  if (error || !session) return error;
  const { id } = await ctx.params;
  const store = await readStore();
  const item = store.knowledge.find(
    (k) => k.id === id && (!k.workspaceId || k.workspaceId === session.workspaceId),
  );
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pagesFromChunks = new Map<number, string[]>();
  for (const chunk of item.chunks || []) {
    const text = sanitizeExtractedText(chunk.text || "");
    if (!text || looksLikePdfBinary(text)) continue;
    const page = chunk.pageNumber && chunk.pageNumber > 0 ? chunk.pageNumber : 1;
    const list = pagesFromChunks.get(page) || [];
    list.push(text);
    pagesFromChunks.set(page, list);
  }

  let pages = Array.from(pagesFromChunks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, parts]) => ({
      pageNumber,
      text: parts.join("\n\n"),
    }));

  if (!pages.length) {
    const content = sanitizeExtractedText(item.content || "");
    if (content && !looksLikePdfBinary(content)) {
      const pageBlocks = content.split(/\n?\[Page\s+(\d+)\]\n/i);
      if (pageBlocks.length > 1) {
        pages = [];
        for (let i = 1; i < pageBlocks.length; i += 2) {
          const pageNumber = Number(pageBlocks[i]);
          const text = sanitizeExtractedText(pageBlocks[i + 1] || "");
          if (text) pages.push({ pageNumber: pageNumber || pages.length + 1, text });
        }
      } else {
        pages = [{ pageNumber: 1, text: content }];
      }
    }
  }

  return NextResponse.json({
    documentId: item.id,
    filename: item.originalFilename || item.title,
    pageCount: item.pageCount || pages.length,
    pages,
  });
}
