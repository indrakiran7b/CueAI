import { NextRequest, NextResponse } from "next/server";
import { extractDocumentText } from "@cueai/shared-libraries/extract-document";
import { requireAuth } from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(pdf|docx|txt|md)$/i;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth(request);
  if (error || !session) {
    return NextResponse.json(
      { error: "Sign in to use Resume Tailor." },
      { status: error?.status || 401, headers: CORS_HEADERS },
    );
  }

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      if (err instanceof Error && err.message.includes("Content-Type was not one of")) {
        return NextResponse.json(
          { error: "Resume file is required." },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      throw err;
    }
    const file = form.get("resume");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Resume file is required." }, { status: 400, headers: CORS_HEADERS });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 5 MB." }, { status: 400, headers: CORS_HEADERS });
    }
    if (!ALLOWED_EXTENSIONS.test(file.name)) {
      return NextResponse.json(
        { error: "Upload a PDF, DOCX, TXT, or Markdown file." },
        { status: 415, headers: CORS_HEADERS },
      );
    }
    // Job descriptions reuse this extractor but must not replace the live-session resume.
    const isJobDescription = form.get("purpose") === "job_description";

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = (await extractDocumentText(buffer, file.name, file.type || "")).trim();
    if (text.length < 40) {
      return NextResponse.json(
        { error: "Could not extract enough text. Try a text-based PDF, DOCX, or TXT." },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    const clipped = text.slice(0, 20000);
    if (!isJobDescription) {
      try {
        const { saveLiveBriefing } = await import("@/lib/server/meetings");
        await saveLiveBriefing({ resumeName: file.name, resumeText: clipped }, session);
      } catch {
        // Briefing persist must not fail the upload.
      }
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
