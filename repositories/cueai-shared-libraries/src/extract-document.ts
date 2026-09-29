import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type ExtractedDocument = {
  text: string;
  pages: ExtractedPage[];
  pageCount: number;
};

/** True when a string looks like raw PDF binary, not extracted text. */
export function looksLikePdfBinary(text: string): boolean {
  const head = text.slice(0, 64).replace(/^\uFEFF/, "");
  if (head.startsWith("%PDF-")) return true;
  if (/%PDF-\d/.test(head)) return true;
  const sample = text.slice(0, 2000);
  if (!sample) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 127) bad += 1;
  }
  return bad / sample.length > 0.08;
}

export function sanitizeExtractedText(text: string): string {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  if (looksLikePdfBinary(trimmed)) return "";
  return trimmed
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Safe short preview for list/API — never returns PDF binary. */
export function safeContentPreview(content: string | undefined | null, max = 240): string {
  const cleaned = sanitizeExtractedText(content || "");
  if (!cleaned) return "";
  return cleaned.slice(0, max);
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pagesRaw = Array.isArray(text) ? text : [String(text || "")];
  const pages: ExtractedPage[] = [];
  for (let i = 0; i < pagesRaw.length; i++) {
    const pageText = sanitizeExtractedText(String(pagesRaw[i] || ""));
    if (pageText) pages.push({ pageNumber: i + 1, text: pageText });
  }
  const joined = pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
  const sanitized = sanitizeExtractedText(joined);
  if (!sanitized) {
    throw new Error(
      "Text extraction is unavailable for this PDF. It may be scanned or image-based.",
    );
  }
  return {
    text: sanitized,
    pages,
    pageCount: typeof totalPages === "number" ? totalPages : pages.length,
  };
}

export async function extractDocument(
  buffer: Buffer,
  filename: string,
  mime: string,
): Promise<ExtractedDocument> {
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith(".pdf") || mime === "application/pdf";
  const isDocx =
    lower.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isTxt =
    !isPdf &&
    !isDocx &&
    (lower.endsWith(".txt") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".md") ||
      lower.endsWith(".markdown") ||
      mime.startsWith("text/") ||
      mime === "application/json" ||
      mime === "text/csv" ||
      mime === "text/markdown");

  if (isPdf) return extractPdf(buffer);

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    const text = sanitizeExtractedText(result.value || "");
    if (!text) throw new Error("Could not extract text from this DOCX file.");
    return { text, pages: [{ pageNumber: 1, text }], pageCount: 1 };
  }

  if (isTxt) {
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
      return extractPdf(buffer);
    }
    const text = sanitizeExtractedText(buffer.toString("utf8"));
    if (!text) throw new Error("Document is empty.");
    return { text, pages: [{ pageNumber: 1, text }], pageCount: 1 };
  }

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return extractPdf(buffer);
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, TXT, Markdown, or CSV.");
}

export async function extractDocumentText(
  buffer: Buffer,
  filename: string,
  mime: string,
): Promise<string> {
  const doc = await extractDocument(buffer, filename, mime);
  return doc.text;
}
