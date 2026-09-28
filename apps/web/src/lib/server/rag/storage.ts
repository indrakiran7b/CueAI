/**
 * Local document file storage under CUEAI_DATA_DIR / .data/knowledge.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";

function dataRoot(): string {
  return (
    process.env.CUEAI_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".data")
  );
}

export function knowledgeDir(workspaceId: string): string {
  return path.join(dataRoot(), "knowledge", workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180) || "document";
}

export async function storeKnowledgeFile(input: {
  workspaceId: string;
  originalFilename: string;
  buffer: Buffer;
}): Promise<{ storagePath: string; checksum: string; relativePath: string }> {
  const dir = knowledgeDir(input.workspaceId);
  await mkdir(dir, { recursive: true });
  const checksum = sha256(input.buffer);
  const id = randomUUID().slice(0, 8);
  const filename = `${id}_${safeFilename(input.originalFilename)}`;
  const storagePath = path.join(dir, filename);
  await writeFile(storagePath, input.buffer);
  return {
    storagePath,
    checksum,
    relativePath: path.join("knowledge", input.workspaceId, filename),
  };
}

export async function readKnowledgeFile(storagePath: string): Promise<Buffer> {
  return readFile(storagePath);
}

export async function deleteKnowledgeFile(storagePath?: string | null): Promise<void> {
  if (!storagePath) return;
  try {
    await unlink(storagePath);
  } catch {
    // missing file is fine
  }
}
