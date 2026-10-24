import type { QuestionAnalysis } from "@/lib/live-question";

/**
 * Deterministic grounding for live answers: separates what the candidate has actually done
 * (resume, profile) from what the job asks for, and tells the model which technologies in the
 * question are backed by the candidate's background. Runs locally with no extra model call.
 */

export type BriefingParts = {
  /** Resume and profile text: the only evidence of the candidate's experience. */
  candidate: string;
  /** Job description / company: requirements, never proof of experience. */
  job: string;
  /** Session notes and other context. */
  other: string;
};

const HEADER = /^(Interview at|Job description|Job posting|Resume on file|CANDIDATE RESUME|Context|Guidance|Call|Meeting)\s*:/i;

export function splitBriefing(sessionContext: string, profileContext = ""): BriefingParts {
  const parts: BriefingParts = { candidate: profileContext.trim(), job: "", other: "" };
  let bucket: keyof BriefingParts = "other";
  for (const line of sessionContext.split(/\r?\n/)) {
    const header = line.match(HEADER)?.[1]?.toLowerCase();
    if (header) {
      bucket =
        header === "candidate resume"
          ? "candidate"
          : header.startsWith("job") || header === "interview at"
            ? "job"
            : "other";
      if (header === "resume on file" || header === "guidance") {
        continue;
      }
    }
    parts[bucket] += `${parts[bucket] ? "\n" : ""}${line}`;
  }
  return parts;
}

/** Technologies recognised in questions, with spellings that count as the same thing. */
const TECH: [string, RegExp][] = [
  ["Python", /\bpython\b/i],
  ["Java", /\bjava\b(?!\s*script)/i],
  ["JavaScript", /\bjava ?script\b|\bjs\b/i],
  ["TypeScript", /\btype ?script\b/i],
  ["PHP", /\bphp\b/i],
  ["C++", /\bc\+\+|\bcpp\b/i],
  ["C#", /\bc#|\bc sharp\b|\.net\b/i],
  ["Go", /\bgolang\b/i],
  ["Rust", /\brust\b/i],
  ["Kotlin", /\bkotlin\b/i],
  ["SQL", /\bsql\b/i],
  ["MySQL", /\bmysql\b/i],
  ["PostgreSQL", /\bpostgres(ql)?\b/i],
  ["MongoDB", /\bmongo(db)?\b/i],
  ["Redis", /\bredis\b/i],
  ["React", /\breact(\.?js)?\b/i],
  ["Angular", /\bangular\b/i],
  ["Vue", /\bvue(\.?js)?\b/i],
  ["Next.js", /\bnext\.?js\b/i],
  ["Node.js", /\bnode(\.?js)?\b/i],
  ["Express", /\bexpress(\.?js)?\b/i],
  ["Django", /\bdjango\b/i],
  ["Flask", /\bflask\b/i],
  ["FastAPI", /\bfast ?api\b/i],
  ["Spring", /\bspring( boot)?\b/i],
  ["Laravel", /\blaravel\b/i],
  ["AWS", /\baws\b|\bamazon web services\b/i],
  ["Azure", /\bazure\b/i],
  ["GCP", /\bgcp\b|\bgoogle cloud\b/i],
  ["Docker", /\bdocker\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Git", /\bgit\b(?!hub)/i],
  ["CI/CD", /\bci\/cd\b|\bjenkins\b|\bgithub actions\b/i],
  ["TensorFlow", /\btensorflow\b/i],
  ["PyTorch", /\bpytorch\b/i],
  ["Pandas", /\bpandas\b/i],
  ["NumPy", /\bnumpy\b/i],
  ["Selenium", /\bselenium\b/i],
  ["pytest", /\bpytest\b/i],
  ["GraphQL", /\bgraphql\b/i],
  ["Kafka", /\bkafka\b/i],
  ["OpenAI GPT", /\bgpt(-?\d[\w.-]*)?\b|\bopenai\b|\bchatgpt\b/i],
  ["Gemini", /\bgemini\b/i],
  ["LangChain", /\blangchain\b/i],
];

export type TechEvidence = { term: string; status: "candidate" | "job_only" | "absent" };

export function techEvidence(question: string, parts: BriefingParts): TechEvidence[] {
  const out: TechEvidence[] = [];
  for (const [term, re] of TECH) {
    if (!re.test(question)) continue;
    const status = re.test(parts.candidate) ? "candidate" : re.test(parts.job) ? "job_only" : "absent";
    out.push({ term, status });
  }
  return out;
}

/**
 * Notes injected into the prompt so the model knows which facts it may claim.
 * Empty when the question is not about the candidate and names no technology.
 */
export function groundingNotes(
  question: string,
  analysis: Pick<QuestionAnalysis, "needsPersonalContext" | "responseType" | "personalPast" | "category" | "asksRationale">,
  parts: BriefingParts,
): string {
  const hasCandidate = parts.candidate.trim().length > 40;
  const notes: string[] = [];
  const personal = analysis.needsPersonalContext;

  if (personal && !hasCandidate) {
    notes.push(
      "No resume or profile is available for this candidate. Do not state any personal facts (name, degree, employers, years of experience, projects, metrics). For a self-introduction or background question, give a short ready-to-adapt structure with [bracketed placeholders] for the personal details and one line suggesting the candidate add a resume for a personalized answer. For project or experience questions, answer with how you would approach it, clearly framed as approach rather than past work.",
    );
  }
  if (parts.job.trim()) {
    notes.push(
      "The job description lists the employer's requirements. They are never evidence that the candidate has those skills; only the resume/profile is.",
    );
  }

  const evidence = techEvidence(question, parts);
  if (hasCandidate) {
    for (const e of evidence) {
      if (e.status === "candidate") {
        notes.push(`${e.term}: in the candidate's background — use only the specific details written there.`);
      } else if (e.status === "job_only") {
        notes.push(
          `${e.term}: appears only in the job requirements, not in the candidate's resume. Do not claim experience with it; explain it accurately and, if personal, say honestly it is something the candidate is learning or would ramp up on.`,
        );
      } else if (personal) {
        notes.push(
          `${e.term}: not in the candidate's resume or profile. Do not claim projects, coursework or experience with it; answer the technical part accurately and be honest about the candidate's level.`,
        );
      }
    }
  }

  if ((analysis.asksRationale || (analysis.personalPast && analysis.responseType === "comparison")) && hasCandidate) {
    notes.push(
      "Asked why the candidate made a choice: state a reason only if the resume gives one. Otherwise answer honestly from the project's real scope (what it needed, what the candidate knew) and the factual trade-offs, without inventing benchmarks, team decisions or requirements.",
    );
  }
  return notes.length ? notes.map((n) => `- ${n}`).join("\n") : "";
}
