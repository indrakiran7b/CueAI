export type ResumeRewrite = {
  section: string;
  original: string;
  rewritten: string;
};

export type RewriteDecision = "pending" | "accepted" | "rejected";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGlyphs(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[•●▪◦]/g, "-");
}

function tokens(text: string) {
  return normalizeGlyphs(text)
    .split(/\s+/)
    .map((t) => t.replace(/^[-•]+/, "").trim())
    .filter((t) => t.length > 1);
}

function flexibleRegex(excerpt: string) {
  const parts = tokens(excerpt).slice(0, 48);
  if (parts.length < 3) return null;
  return new RegExp(parts.map(escapeRegExp).join("\\s+"), "i");
}

function replaceExcerpt(source: string, original: string, replacement: string): string | null {
  if (!original.trim() || !replacement.trim()) return null;
  if (source.includes(original)) {
    return source.replace(original, replacement);
  }

  const re = flexibleRegex(original);
  if (!re) return null;
  const match = source.match(re);
  if (!match || match.index === undefined) return null;
  if (match[0].length > Math.max(replacement.length * 4, original.length * 3)) return null;
  return source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
}

const SECTION_ALIASES: Record<string, string[]> = {
  summary: [
    "profile summary",
    "professional summary",
    "career summary",
    "summary",
    "objective",
    "about me",
    "about",
  ],
  experience: [
    "work experience",
    "professional experience",
    "employment",
    "experience",
    "internships",
    "internship",
  ],
  projects: ["academic projects", "personal projects", "projects"],
  skills: ["technical skills", "core skills", "skills", "technologies"],
  education: ["education", "academics"],
};

function aliasesForSection(section: string) {
  const key = section.toLowerCase();
  for (const [name, aliases] of Object.entries(SECTION_ALIASES)) {
    if (key.includes(name) || aliases.some((a) => key.includes(a))) return aliases;
  }
  return [section];
}

function headingPattern(section: string) {
  const aliases = aliasesForSection(section)
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return new RegExp(`(?:^|\\n)\\s*(${aliases.join("|")})\\s*:?\\s*(?=\\n|$)`, "i");
}

function nextHeadingIndex(text: string, from: number) {
  const all = Object.values(SECTION_ALIASES).flat();
  const re = new RegExp(
    `\\n\\s*(${all.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})\\s*:?\\s*(?=\\n|$)`,
    "i"
  );
  const slice = text.slice(from);
  const m = slice.match(re);
  if (!m || m.index === undefined) return text.length;
  return from + m.index;
}

function replaceSection(source: string, section: string, replacement: string): string | null {
  const re = headingPattern(section);
  const m = source.match(re);
  if (!m || m.index === undefined) return null;
  const headingEnd = m.index + m[0].length;
  const bodyStart = headingEnd;
  const bodyEnd = nextHeadingIndex(source, bodyStart + 1);
  const heading = source.slice(m.index, headingEnd).replace(/^\n/, "");
  const prefix = source.slice(0, m.index);
  const suffix = source.slice(bodyEnd);
  const joined = `${prefix}${prefix.endsWith("\n") || prefix.length === 0 ? "" : "\n"}${heading.trim()}\n${replacement.trim()}\n${suffix}`;
  return joined;
}

export function applyResumeRewrites(
  baseText: string,
  rewrites: ResumeRewrite[],
  decisions: RewriteDecision[]
) {
  let next = baseText;
  let inPlace = 0;
  let bySection = 0;
  let appended = 0;

  const order = rewrites
    .map((rewrite, i) => ({ rewrite, i }))
    .filter(({ i }) => decisions[i] !== "rejected")
    .sort((a, b) => b.rewrite.original.length - a.rewrite.original.length);

  for (const { rewrite } of order) {
    const excerpt = replaceExcerpt(next, rewrite.original, rewrite.rewritten);
    if (excerpt && excerpt !== next) {
      next = excerpt;
      inPlace += 1;
      continue;
    }
    const sectioned = replaceSection(next, rewrite.section, rewrite.rewritten);
    if (sectioned && sectioned !== next) {
      next = sectioned;
      bySection += 1;
      continue;
    }
    next = `${next.trimEnd()}\n\n${rewrite.section}\n${rewrite.rewritten}\n`;
    appended += 1;
  }

  return {
    text: `${next.trim()}\n`,
    inPlace,
    bySection,
    appended,
    applied: inPlace + bySection + appended,
  };
}
