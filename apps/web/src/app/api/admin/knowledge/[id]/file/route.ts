import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { requirePermission } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import { readKnowledgeFile } from "@/lib/server/rag/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/knowledge/:id/file
 * Authenticated binary download of the original document (PDF viewer).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requirePermission("knowledge.read", req);
  if (error || !session) return error;
  const { id } = await ctx.params;
  const store = await readStore();
  const item = store.knowledge.find(
    (k) => k.id === id && (!k.workspaceId || k.workspaceId === session.workspaceId),
  );
  if (!item?.storagePath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Path traversal guard: only allow files under the knowledge data root.
  const resolved = path.resolve(/* turbopackIgnore: true */ item.storagePath);
  const dataRoot = path.resolve(
    /* turbopackIgnore: true */
    process.env.CUEAI_DATA_DIR?.trim() || path.join(process.cwd(), ".data"),
  );
  if (!resolved.startsWith(dataRoot + path.sep) && resolved !== dataRoot) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }

  try {
    const buf = await readKnowledgeFile(resolved);
    const filename = (item.originalFilename || item.title || "document").replace(
      /[^\w.\- ()[\]]+/g,
      "_",
    );
    const mime =
      item.mimeType ||
      (item.type === "pdf" ? "application/pdf" : "application/octet-stream");

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not readable" }, { status: 404 });
  }
}
