import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export async function extractDocumentText(
  buffer: Buffer,
  filename: string,
  mime: string,
): Promise<string> {
  const lower = filename.toLowerCase();
  const isTxt =
    lower.endsWith(".txt") || mime.startsWith("text/") || mime === "application/json";
  const isPdf = lower.endsWith(".pdf") || mime === "application/pdf";
  const isDocx =
    lower.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (isTxt) return buffer.toString("utf8");
  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }
  if (isPdf) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : String(text || "");
  }
  throw new Error("Unsupported file type. Upload PDF, DOCX, or TXT.");
}
