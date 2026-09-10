import { NextResponse } from "next/server";
import { extractDocumentText } from "@/lib/server/extract-document";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("resume");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Resume file is required." }, { status: 400, headers: CORS_HEADERS });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 5 MB." }, { status: 400, headers: CORS_HEADERS });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = (await extractDocumentText(buffer, file.name, file.type || "")).trim();
    if (text.length < 40) {
      return NextResponse.json(
        { error: "Could not extract enough text. Try a text-based PDF, DOCX, or TXT." },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    const clipped = text.slice(0, 20000);
    try {
      const { saveLiveBriefing } = await import("@/lib/server/meetings");
      await saveLiveBriefing({ resumeName: file.name, resumeText: clipped });
    } catch {
      // Briefing persist must not fail the upload.
    }

    return NextResponse.json(
      { ok: true, name: file.name, text: clipped },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read that file." },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
