import { resumeAnalysis, resumeOriginal, resumeTailored } from "../data/mock";

export type ParseResult = {
  pages: number;
  tokens: number;
  sections: string[];
};

export type MatchResult = {
  matchScore: number;
  requiredSkills: string[];
  preferredSkills: string[];
  keywords: string[];
  missingKeywords: string[];
  skillsGap: string[];
  parsedResume: ParseResult;
  parsedJd: ParseResult;
  tailored: string;
};

const SKILL_BANK = [
  "React",
  "TypeScript",
  "RAG",
  "Real-time UX",
  "Privacy controls",
  "Speech UX",
  "ATS optimization",
  "Document parsing",
  "WebRTC",
  "SOC2",
  "Python",
  "Kotlin",
];

export function mockParseDocument(label: string, text: string): ParseResult {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return {
    pages: Math.max(1, Math.round(words / 280)),
    tokens: Math.round(words * 1.3),
    sections: label.toLowerCase().includes("jd") || label.toLowerCase().includes("job")
      ? ["Requirements", "Preferred", "Responsibilities"]
      : ["SUMMARY", "EXPERIENCE", "PROJECTS", "SKILLS"],
  };
}

export function mockMatchResumeToJd(jd: string, resumeText = resumeOriginal): MatchResult {
  const jdLower = jd.toLowerCase();
  const resumeLower = resumeText.toLowerCase();
  const required = SKILL_BANK.filter((s) => jdLower.includes(s.toLowerCase())).slice(0, 6);
  const present = required.filter((s) => resumeLower.includes(s.toLowerCase()));
  const missing = [
    ...required.filter((s) => !present.includes(s)),
    ...SKILL_BANK.filter((s) => jdLower.includes(s.toLowerCase()) && !resumeLower.includes(s.toLowerCase())),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const base = resumeAnalysis.matchScore;
  const delta = Math.round((present.length - missing.length) * 2.5);
  const matchScore = Math.max(55, Math.min(96, base + delta));

  const preferred = resumeAnalysis.preferredSkills.filter((s) => jdLower.includes(s.toLowerCase()) || true).slice(0, 3);

  return {
    matchScore,
    requiredSkills: required.length ? required : resumeAnalysis.requiredSkills,
    preferredSkills: preferred.length ? preferred : resumeAnalysis.preferredSkills,
    keywords: resumeAnalysis.keywords,
    missingKeywords: missing.slice(0, 4).length ? missing.slice(0, 4) : resumeAnalysis.missingKeywords,
    skillsGap: missing.slice(0, 3).map((m) => `${m} not evidenced`) || resumeAnalysis.skillsGap,
    parsedResume: mockParseDocument("resume", resumeText),
    parsedJd: mockParseDocument("jd", jd),
    tailored: injectRoleKeywords(resumeTailored, required),
  };
}

function injectRoleKeywords(base: string, skills: string[]) {
  if (!skills.length) return base;
  return base.replace(
    /SKILLS\n[\s\S]*$/,
    `SKILLS\n${skills.join(" · ")} · TypeScript · React · Privacy controls`,
  );
}
