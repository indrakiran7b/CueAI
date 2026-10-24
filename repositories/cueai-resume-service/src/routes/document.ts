import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { canAccessResumeTailor } from "@/lib/roles";
import { extractJobKeywords, scoreResume } from "@/lib/resume/ats";
import { cleanText, coerceResume, hasContent } from "@/lib/resume/normalize";
import { buildResumePdf, resumeFileName } from "@/lib/resume/pdf";
import { TEMPLATES, isTemplateId } from "@/lib/resume/templates";

export const runtime = "nodejs";

const MAX_BODY = 400_000;

async function authorize(request: NextRequest) {
  const { error, session } = await requireAuth(request);
  if (error || !session) return { denied: error ?? NextResponse.json({ error: "Sign in to use Resume Tailor." }, { status: 401 }) };
  if (!canAccessResumeTailor(session.role)) {
    return { denied: NextResponse.json({ error: "Sign in to use Resume Tailor." }, { status: 403 }) };
  }
  return { session };
}

async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (!text || text.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** POST { resume, template } → application/pdf generated from the accepted resume. */
export async function renderPdf(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.denied) return auth.denied;
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Invalid resume data." }, { status: 400 });
  if (!isTemplateId(body.template)) return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  const resume = coerceResume(body.resume);
  if (!resume.name && !hasContent(resume)) {
    return NextResponse.json({ error: "The resume is empty." }, { status: 400 });
  }
  const t0 = performance.now();
  try {
    const built = await buildResumePdf(resume, body.template);
    const ms = Math.round(performance.now() - t0);
    console.info("resume_pdf_rendered", { template: body.template, pages: built.layout.pages.length, bytes: built.bytes.length, ms });
    const filename = resumeFileName(resume.name);
    return new NextResponse(Buffer.from(built.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Resume-Pages": String(built.layout.pages.length),
        "X-Resume-Render-Ms": String(ms),
      },
    });
  } catch (err) {
    console.error("resume_pdf_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not generate the PDF. Please try again." }, { status: 500 });
  }
}

/** POST { resume, jobDescription?, jobKeywords? } → ATS report for the current resume content. */
export async function rescore(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.denied) return auth.denied;
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Invalid resume data." }, { status: 400 });
  const resume = coerceResume(body.resume);
  const jobDescription = cleanText(body.jobDescription, 20000);
  const proposed = Array.isArray(body.jobKeywords) ? body.jobKeywords.map((k) => cleanText(k, 60)) : [];
  const keywords = jobDescription ? extractJobKeywords(jobDescription, proposed) : [];
  return NextResponse.json({ ats: scoreResume(resume, keywords, Boolean(jobDescription)), jobKeywords: keywords });
}

export async function listTemplates(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.denied) return auth.denied;
  return NextResponse.json({
    templates: TEMPLATES.map(({ id, name, useCase, characteristics }) => ({ id, name, useCase, characteristics })),
  });
}
