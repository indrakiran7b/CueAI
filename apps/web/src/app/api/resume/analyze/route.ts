import { NextResponse } from "next/server";
import { extractDocumentText } from "@/lib/server/extract-document";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Current Groq production chat models (Llama 3.x IDs were decommissioned Aug 2026).
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const GROQ_MODEL_FALLBACKS = [
  GROQ_MODEL,
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
].filter((v, i, arr) => arr.indexOf(v) === i);

export type ResumeRewrite = {
  section: string;
  original: string;
  rewritten: string;
};

export type ResumeAnalysis = {
  matchScore: number;
  atsScore: number;
  keywordCoverage: number;
  missingKeywords: string[];
  suggestedSkills: string[];
  summary: string;
  rewrites: ResumeRewrite[];
  resumeText: string;
  resumePreview: string;
  usedJobDescription: boolean;
};

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}


function buildPrompt(resumeText: string, jobDescription: string, profileContext: string) {
  const hasJd = Boolean(jobDescription.trim());
  return `You are an expert resume coach and ATS analyst for CueAI Resume Tailor.
${profileContext ? `\nWhat we know about this candidate from their CueAI setup:\n${profileContext}\nUse this to bias keywords, tone, and suggested skills toward their target roles.\n` : ""}
Analyze the candidate resume${hasJd ? " against the optional job description" : ""}.
Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "matchScore": 0-100,
  "atsScore": 0-100,
  "keywordCoverage": 0-100,
  "missingKeywords": ["..."],
  "suggestedSkills": ["..."],
  "summary": "2-3 sentence coaching summary",
  "rewrites": [
    { "section": "Experience|Summary|Skills|...", "original": "short excerpt from resume", "rewritten": "stronger ATS-friendly rewrite" }
  ]
}

Rules:
- Scores must be integers 0-100.
- Provide 3 to 5 rewrite suggestions covering Summary, Experience, Projects, and Skills when those sections exist.
- "original" MUST be an exact contiguous excerpt copied from the RESUME text (same wording/punctuation) so it can be find-and-replaced.
- "rewritten" should be a drop-in replacement for that exact excerpt (same scope: one bullet, one paragraph, or one skills line).
- missingKeywords: important role/domain keywords not clearly present${hasJd ? " (prioritize JD terms)" : ""}.
- suggestedSkills: concrete skills the candidate should highlight or add.
- If no job description is provided, estimate general market fit / ATS readiness and still produce useful rewrites.
- Be specific and actionable. Do not invent employers or degrees that are not in the resume.

RESUME:
"""
${resumeText.slice(0, 14000)}
"""

JOB_DESCRIPTION:
"""
${hasJd ? jobDescription.slice(0, 8000) : "(not provided)"}
"""`;
}

function parseModelJson(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Model returned non-JSON output");
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY?.trim() || "";
  const { resolveGeminiCredentials } = await import("@/lib/server/gemini");
  const gemini = await resolveGeminiCredentials();
  if (!apiKey && !gemini) {
    return NextResponse.json(
      { error: "No AI key is configured. Add GROQ_API_KEY (primary) and/or GEMINI_API_KEY." },
      { status: 503 }
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("resume");
    const jobDescription = String(form.get("jobDescription") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Resume file is required." }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 5 MB limit." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const resumeText = (await extractDocumentText(buffer, file.name, file.type || "")).trim();
    try {
      const { saveLiveBriefing } = await import("@/lib/server/meetings");
      await saveLiveBriefing({ resumeName: file.name, resumeText: resumeText.slice(0, 20000) });
    } catch {
      // ignore
    }

    if (resumeText.length < 80) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough text from that file. Try a text-based PDF, DOCX, or TXT.",
        },
        { status: 422 }
      );
    }

    let profileContext = "";
    try {
      const { getSessionFromRequest } = await import("@/lib/server/api-auth");
      const { getProfileContext } = await import("@/lib/server/user-profile");
      profileContext = await getProfileContext((await getSessionFromRequest())?.userId);
    } catch {
      // Personalization is best-effort; never block analysis.
    }

    let content: string | undefined;
    let lastError = "";
    let usedProvider = "groq";
    let usedModel = GROQ_MODEL;

    if (apiKey) {
      for (const model of GROQ_MODEL_FALLBACKS) {
        const groqRes = await fetch(GROQ_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_completion_tokens: 2500,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You return only compact JSON for resume analysis. Never include markdown or commentary.",
              },
              {
                role: "user",
                content: buildPrompt(resumeText, jobDescription, profileContext),
              },
            ],
          }),
        });

        if (!groqRes.ok) {
          lastError = await groqRes.text();
          console.error("groq_resume_analyze_failed", model, groqRes.status, lastError.slice(0, 400));
          if (groqRes.status === 401 || groqRes.status === 403) break;
          continue;
        }

        const payload = (await groqRes.json()) as {
          choices?: { message?: { content?: string | null } }[];
        };
        content = payload.choices?.[0]?.message?.content?.trim() || undefined;
        if (content) {
          usedModel = model;
          break;
        }
      }
    }

    if (!content && gemini) {
      const { generateGeminiText } = await import("@/lib/server/gemini");
      const fallback = await generateGeminiText({
        credentials: gemini,
        system: "You return only compact JSON for resume analysis. Never include markdown or commentary.",
        prompt: buildPrompt(resumeText, jobDescription, profileContext),
        temperature: 0.3,
        maxOutputTokens: 2500,
      });
      content = fallback.text;
      usedProvider = "gemini";
      usedModel = fallback.model;
    }

    if (!content) {
      console.error("resume_analyze_exhausted", lastError.slice(0, 400));
      return NextResponse.json(
        { error: "AI analysis failed. Groq did not return a result and Gemini is unavailable." },
        { status: 502 }
      );
    }

    const parsed = parseModelJson(content);
    const rewritesRaw = Array.isArray(parsed.rewrites) ? parsed.rewrites : [];
    const rewrites: ResumeRewrite[] = rewritesRaw
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          section: String(row.section || "Experience").slice(0, 80),
          original: String(row.original || "").slice(0, 800),
          rewritten: String(row.rewritten || "").slice(0, 1200),
        };
      })
      .filter((r) => r.original && r.rewritten)
      .slice(0, 6);

    const analysis: ResumeAnalysis = {
      matchScore: clampScore(parsed.matchScore),
      atsScore: clampScore(parsed.atsScore),
      keywordCoverage: clampScore(parsed.keywordCoverage),
      missingKeywords: asStringArray(parsed.missingKeywords),
      suggestedSkills: asStringArray(parsed.suggestedSkills),
      summary: String(parsed.summary || "Analysis complete.").slice(0, 800),
      rewrites:
        rewrites.length > 0
          ? rewrites
          : [
              {
                section: "Summary",
                original: resumeText.slice(0, 220),
                rewritten:
                  "Strengthen your opening with quantified impact, role keywords, and clear ownership of outcomes.",
              },
            ],
      resumeText,
      resumePreview: resumeText.slice(0, 1200),
      usedJobDescription: Boolean(jobDescription),
    };

    try {
      const { randomUUID } = await import("node:crypto");
      const { getSessionFromRequest } = await import("@/lib/server/api-auth");
      const { recordUsageEvent } = await import("@/lib/server/usage");
      const session = await getSessionFromRequest();
      const estTokens = Math.max(500, Math.round((resumeText.length + jobDescription.length) / 4) + 800);
      const requestId = randomUUID();
      await recordUsageEvent(session, {
        type: "resume_rewrite",
        quantity: Math.max(1, analysis.rewrites.length),
        inputTokens: Math.round(estTokens * 0.7),
        outputTokens: Math.round(estTokens * 0.3),
        provider: usedProvider,
        model: usedModel,
        idempotencyKey: `resume_rewrite:${requestId}`,
        metadata: { feature: "resume_analyze", requestId },
      });
      await recordUsageEvent(session, {
        type: "tokens",
        quantity: estTokens,
        inputTokens: Math.round(estTokens * 0.7),
        outputTokens: Math.round(estTokens * 0.3),
        provider: usedProvider,
        model: usedModel,
        idempotencyKey: `tokens:resume:${requestId}`,
        metadata: { feature: "resume_analyze", requestId },
      });
    } catch {
      // usage tracking should never block analysis
    }

    return NextResponse.json(analysis);
  } catch (err) {
    console.error("resume_analyze_error", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unexpected resume analysis error",
      },
      { status: 500 }
    );
  }
}
