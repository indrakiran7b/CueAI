import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { canAccessResumeTailor } from "@/lib/roles";
import { extractJobKeywords, scoreResume } from "@/lib/resume/ats";
import { JOB_DESCRIPTION_REQUIRED_MESSAGE, normalizeJobDescription } from "@/lib/resume/job-description";
import { analyzeJobDescription, matchResume } from "@/lib/resume/match";
import { cleanText, coerceResume, hasContent } from "@/lib/resume/normalize";
import { buildResumePdf, resumeFileName, type BuiltPdf } from "@/lib/resume/pdf";
import { buildRecommendations } from "@/lib/resume/recommendations";
import { TEMPLATES, isTemplateId } from "@/lib/resume/templates";
import type { JobProfile, StructuredResume } from "@/lib/resume/types";

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

function squash(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Validates the generated file itself: page count read back from the PDF, layout checks, and
 * that the PDF's extracted text really contains this resume's name and opening content.
 */
async function pdfProblem(built: BuiltPdf, resume: StructuredResume): Promise<string | null> {
  if (built.pageCount !== built.layout.pages.length) return `page count ${built.pageCount} does not match the layout (${built.layout.pages.length}).`;
  if (!built.fit.validation.ok) return built.fit.validation.issues[0] ?? "layout validation failed.";
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(built.bytes)), { mergePages: true });
  const flat = squash(text);
  const probes = [resume.name, resume.summary.split(/\s+/).slice(0, 6).join(" ")].filter((p) => squash(p).length >= 4);
  const missing = probes.find((p) => !flat.includes(squash(p).slice(0, 40)));
  return missing ? "the generated text does not match the resume content." : null;
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
    const problem = await pdfProblem(built, resume);
    const ms = Math.round(performance.now() - t0);
    console.info("resume_pdf_rendered", {
      template: body.template,
      pages: built.pageCount,
      density: built.layout.density,
      ok: !problem,
      bytes: built.bytes.length,
      ms,
    });
    if (problem) return NextResponse.json({ error: `The PDF failed layout checks: ${problem}` }, { status: 422 });
    const filename = resumeFileName(resume.name);
    return new NextResponse(Buffer.from(built.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Resume-Pages": String(built.pageCount),
        "X-Resume-Density": String(built.layout.density),
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
  const legacy = { ats: scoreResume(resume, keywords, Boolean(jobDescription)), jobKeywords: keywords };
  if (!body.job || typeof body.job !== "object") return NextResponse.json(legacy);

  // Re-analysis of edited or tailored content against the same job profile (no AI call).
  const jd = normalizeJobDescription(body.jobDescription);
  if (!jd) return NextResponse.json({ error: JOB_DESCRIPTION_REQUIRED_MESSAGE }, { status: 400 });
  const prior = body.job as Partial<JobProfile>;
  const job = analyzeJobDescription(jd, { title: prior.title, requirements: prior.requirements, minYears: prior.minYears });
  const evidence = prior.semanticEvidence && typeof prior.semanticEvidence === "object" ? prior.semanticEvidence : {};
  for (const req of job.requirements) {
    const text = cleanText((evidence as Record<string, unknown>)[req.id], 300);
    if (text) job.semanticEvidence[req.id] = text;
  }
  const match = matchResume(resume, job);
  return NextResponse.json({
    ...legacy,
    job,
    match,
    recommendations: buildRecommendations(resume, job, match),
    analyzedAt: new Date().toISOString(),
  });
}

export async function listTemplates(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.denied) return auth.denied;
  return NextResponse.json({
    templates: TEMPLATES.map(({ id, name, useCase, characteristics }) => ({ id, name, useCase, characteristics })),
  });
}
