import { formattingChecks, mentions } from "./ats";
import { overlap, type WorkLine } from "./match";
import type { JobProfile, MatchReport, Recommendation, StructuredResume } from "./types";

const VAGUE = /^(responsible for|worked on|working on|helped|helping|involved in|tasked with|duties included|participated in|assisted with|handled)\b/i;

function bullets(r: StructuredResume): WorkLine[] {
  return [
    ...r.experience.flatMap((e, i) => e.bullets.map((b) => ({ text: b, entry: `experience.${i}`, kind: "experience" as const }))),
    ...r.internships.flatMap((e, i) => e.bullets.map((b) => ({ text: b, entry: `internships.${i}`, kind: "internship" as const }))),
    ...r.projects.flatMap((p, i) => p.bullets.map((b) => ({ text: b, entry: `projects.${i}`, kind: "project" as const }))),
  ];
}

function list(items: string[], max = 4) {
  const shown = items.slice(0, max);
  return shown.length < items.length ? `${shown.join(", ")} and ${items.length - shown.length} more` : shown.join(", ");
}

/**
 * Actionable recommendations derived from the match report and the resume itself.
 * Each one cites the resume text or requirement it is based on; nothing is generic filler.
 */
export function buildRecommendations(resume: StructuredResume, job: JobProfile, report: MatchReport): Recommendation[] {
  const out: Recommendation[] = [];
  const all = bullets(resume);
  const listed = resume.skills.flatMap((g) => g.items);
  const shown = report.matches.filter((m) => m.status === "demonstrated" && m.category !== "responsibility" && m.category !== "qualification");

  // Summary aimed at the role.
  const summaryWords = resume.summary.split(/\s+/).filter(Boolean).length;
  const topShown = shown.filter((m) => m.priority === "high").map((m) => m.name);
  const summaryMissesTop = topShown.filter((s) => !mentions(resume.summary, s));
  if (!resume.summary || summaryWords < 20 || (topShown.length >= 2 && summaryMissesTop.length >= Math.ceil(topShown.length / 2))) {
    out.push({
      id: "summary",
      kind: "summary",
      title: "Strengthen the professional summary",
      issue: !resume.summary
        ? "Your resume has no professional summary."
        : summaryWords < 20
          ? `Your summary is only ${summaryWords} words and does not position you for the role.`
          : `Your summary does not mention ${list(summaryMissesTop, 3)}, which your experience already shows and the job requires.`,
      suggestion: `Open with 2–3 sentences aimed at ${job.title || "the target role"} that name your strongest relevant skills${topShown.length ? ` (${list(topShown, 3)})` : ""} and the kind of work you have done.`,
      benefit: "Recruiters and ATS keyword filters read the summary first; a targeted one lifts keyword alignment immediately.",
      evidence: resume.summary ? [resume.summary.slice(0, 220)] : [],
      priority: "high",
    });
  }

  // Skills the work already proves but the skills list omits.
  const unlisted = shown.filter((m) => !listed.some((s) => mentions(s, m.name) || s.toLowerCase() === m.name.toLowerCase()));
  if (unlisted.length) {
    out.push({
      id: "supported_skills",
      kind: "supported_skills",
      title: "Add skills your experience already supports",
      issue: `${list(unlisted.map((m) => m.name))} appear in your work but not in your skills section.`,
      suggestion: `List ${list(unlisted.map((m) => m.name))} in your skills section, using the job description's wording.`,
      benefit: "ATS parsers often weight the skills section; listing proven skills raises the match without adding anything untrue.",
      evidence: unlisted.slice(0, 3).map((m) => m.evidence),
      priority: "high",
    });
  }

  // Listed-only skills the job needs: show where they were used.
  const listedOnly = report.matches.filter((m) => m.status === "partial" && /Listed in your skills/.test(m.note) && m.priority !== "low");
  if (listedOnly.length) {
    out.push({
      id: "show_skill_usage",
      kind: "show_skill_usage",
      title: "Show where you used key skills",
      issue: `${list(listedOnly.map((m) => m.name))} are only listed as skills; no role or project shows them in use.`,
      suggestion: "If you have used them, add them to the bullet or project where you did (e.g. the project's tech line). Do not add them where you didn't.",
      benefit: "Evidence in context is weighted more than a bare skills list, by both ATS ranking and reviewers.",
      evidence: listedOnly.slice(0, 3).map((m) => m.evidence),
      priority: "medium",
    });
  }

  // Related-but-different terms.
  const related = report.matches.filter((m) => m.status === "partial" && /^Related experience/.test(m.note) && m.priority !== "low");
  if (related.length) {
    out.push({
      id: "keywords",
      kind: "keywords",
      title: "Improve keyword coverage with accurate terms",
      issue: `The job asks for ${list(related.map((m) => m.name))}; your resume shows related tools instead.`,
      suggestion: "Where you genuinely used the requested tool, name it explicitly. Otherwise keep the related tool and treat the gap as something to learn.",
      benefit: "Exact terminology helps keyword-based ATS filters recognise transferable experience.",
      evidence: related.slice(0, 3).map((m) => m.evidence),
      priority: "medium",
    });
  }

  // Vague responsibility statements.
  const vague = all.filter((b) => VAGUE.test(b.text.trim()));
  if (vague.length) {
    out.push({
      id: "vague_bullets",
      kind: "vague_bullets",
      title: "Replace vague responsibilities with specific achievements",
      issue: `${vague.length} bullet${vague.length === 1 ? "" : "s"} describe duties (“${vague[0]!.text.split(" ").slice(0, 3).join(" ")}…”) rather than what you delivered.`,
      suggestion: "Start each bullet with an action verb and state what you built, changed or delivered, and for whom.",
      benefit: "Achievement-focused bullets read as stronger evidence for the same experience.",
      evidence: vague.slice(0, 3).map((b) => b.text),
      priority: "medium",
    });
  }

  // Metrics: ask, never invent.
  const unquantified = all.filter((b) => !/\d/.test(b.text));
  if (all.length && unquantified.length / all.length > 0.75) {
    out.push({
      id: "metrics",
      kind: "metrics",
      title: "Add real measurable outcomes",
      issue: `${unquantified.length} of ${all.length} bullets have no measurable result.`,
      suggestion: "Where you know them, add real figures (users, time saved, volume, accuracy). CueAI will not invent numbers for you.",
      benefit: "Quantified results make impact concrete and help you stand out among similar candidates.",
      evidence: unquantified.slice(0, 2).map((b) => b.text),
      priority: "low",
    });
  }

  // Section order for early-career candidates.
  const projectRelevance = resume.projects.length
    ? report.matches.filter((m) => m.status === "demonstrated" && resume.projects.some((p) => [p.name, p.tech, ...p.bullets].some((t) => mentions(t, m.name)))).length
    : 0;
  if (resume.projects.length && report.candidateYears < 1.5 && projectRelevance > 0) {
    out.push({
      id: "section_order",
      kind: "section_order",
      title: "Lead with your most relevant projects",
      issue: `With about ${report.candidateYears} years of work experience, your projects carry most of the evidence for this role.`,
      suggestion: "Place projects above work history and order them by relevance to the job. Tailoring does this for you.",
      benefit: "Reviewers see your strongest evidence in the first few seconds.",
      evidence: resume.projects.slice(0, 2).map((p) => p.name),
      priority: "medium",
    });
  }

  // Repetition.
  const repeats: string[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (overlap(all[i]!.text, all[j]!.text) >= 0.7 && overlap(all[j]!.text, all[i]!.text) >= 0.7) repeats.push(all[j]!.text);
    }
  }
  const verbs = all.map((b) => b.text.trim().split(/\s+/)[0]?.toLowerCase() || "");
  const overused = [...new Set(verbs)].filter((v) => v && verbs.filter((x) => x === v).length >= 4);
  if (repeats.length || overused.length) {
    out.push({
      id: "repetition",
      kind: "repetition",
      title: "Remove repetitive content",
      issue: repeats.length
        ? `${repeats.length} bullet${repeats.length === 1 ? " repeats" : "s repeat"} another bullet almost word for word.`
        : `“${overused[0]}” starts ${verbs.filter((x) => x === overused[0]).length} bullets.`,
      suggestion: repeats.length ? "Merge or remove the duplicates." : "Vary your action verbs so each bullet reads distinctly.",
      benefit: "Frees space for relevant content and keeps the resume to one page when possible.",
      evidence: repeats.slice(0, 2),
      priority: "low",
    });
  }

  // Low-relevance entries.
  const reqNames = report.matches.filter((m) => m.category !== "responsibility" && m.category !== "qualification").map((m) => m.name);
  const respNames = job.requirements.filter((r) => r.category === "responsibility").map((r) => r.name);
  const entries = [
    ...resume.experience.map((e, i) => ({ key: `experience.${i}`, label: [e.title, e.organization].filter(Boolean).join(", ") })),
    ...resume.projects.map((p, i) => ({ key: `projects.${i}`, label: p.name })),
  ];
  const irrelevant = entries.filter((e) => {
    const lines = all.filter((b) => b.entry === e.key).map((b) => b.text).concat(e.label);
    return lines.every((l) => !reqNames.some((n) => mentions(l, n)) && !respNames.some((r) => overlap(r, l) >= 0.28));
  });
  if (reqNames.length >= 3 && irrelevant.length && irrelevant.length < entries.length) {
    out.push({
      id: "irrelevant",
      kind: "irrelevant",
      title: "Shorten content that doesn't support this role",
      issue: `${list(irrelevant.map((e) => e.label), 3)} show none of the job's requirements.`,
      suggestion: "Keep these entries brief (one or two bullets) so relevant work gets more space.",
      benefit: "A tighter resume keeps reviewers on your strongest evidence and helps fit one page.",
      evidence: irrelevant.slice(0, 3).map((e) => e.label),
      priority: "low",
    });
  }

  // Formatting / ATS compatibility (kept separate from the match score).
  const failed = formattingChecks(resume).filter((c) => !c.passed && ["name", "email", "phone", "dates", "skills", "bullet_length", "education"].includes(c.id));
  if (failed.length) {
    out.push({
      id: "formatting",
      kind: "formatting",
      title: "Improve formatting and ATS compatibility",
      issue: failed.map((c) => `${c.label}: ${c.detail}`).join(" "),
      suggestion: "Fix the items above; the templates already use a single-column, ATS-safe layout.",
      benefit: "ATS parsers need contact details, dates and clear sections to read your resume correctly.",
      evidence: [],
      priority: failed.some((c) => c.id === "email" || c.id === "name") ? "high" : "medium",
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
