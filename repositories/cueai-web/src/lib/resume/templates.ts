import type { TemplateId } from "./types";

export type Family = "helvetica" | "times";
export type SectionKey =
  | "summary"
  | "skills"
  | "experience"
  | "internships"
  | "projects"
  | "education"
  | "certifications"
  | "achievements"
  | "coursework"
  | "extra";

export type TemplateStyle = {
  family: Family;
  margin: { top: number; right: number; bottom: number; left: number };
  name: { size: number; align: "left" | "center"; uppercase: boolean; color: string };
  headline: { size: number; italic: boolean };
  contact: { size: number; align: "left" | "center"; separator: string };
  heading: {
    size: number;
    uppercase: boolean;
    color: string;
    rule: "full" | "none";
    ruleColor: string;
    ruleWidth: number;
    spaceBefore: number;
    spaceAfter: number;
  };
  body: { size: number; lineHeight: number; color: string; muted: string };
  bullet: string;
  skills: "grouped" | "inline";
  coursework: "inline" | "list";
  /** "title" puts the role first ("Engineer, Acme"); "organization" leads with the employer. */
  entryOrder: "title" | "organization";
  showTechLine: boolean;
  entryGap: number;
  order: SectionKey[];
  titles: Record<SectionKey, string>;
};

export type TemplateInfo = {
  id: TemplateId;
  name: string;
  useCase: string;
  characteristics: string[];
  style: TemplateStyle;
};

const TITLES: Record<SectionKey, string> = {
  summary: "Professional Summary",
  skills: "Skills",
  experience: "Experience",
  internships: "Internships",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  achievements: "Achievements",
  coursework: "Relevant Coursework",
  extra: "",
};

const MARGIN = { top: 46, right: 50, bottom: 46, left: 50 };

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "classic",
    name: "Classic ATS",
    useCase: "Any role; the most conservative, text-focused layout",
    characteristics: ["Single column, serif type", "Centered name and contact line", "Ruled, uppercase section headings"],
    style: {
      family: "times",
      margin: MARGIN,
      name: { size: 20, align: "center", uppercase: false, color: "#111111" },
      headline: { size: 11, italic: true },
      contact: { size: 10, align: "center", separator: "  |  " },
      heading: { size: 11.5, uppercase: true, color: "#111111", rule: "full", ruleColor: "#111111", ruleWidth: 0.8, spaceBefore: 11, spaceAfter: 5 },
      body: { size: 10.5, lineHeight: 1.28, color: "#111111", muted: "#444444" },
      bullet: "•",
      skills: "grouped",
      coursework: "inline",
      entryOrder: "title",
      showTechLine: false,
      entryGap: 6,
      order: ["summary", "experience", "internships", "projects", "education", "skills", "certifications", "achievements", "coursework", "extra"],
      titles: TITLES,
    },
  },
  {
    id: "modern",
    name: "Modern Professional",
    useCase: "Corporate, product and technology roles",
    characteristics: ["Clean sans-serif type", "Left-aligned header with teal accent", "Skills near the top, generous spacing"],
    style: {
      family: "helvetica",
      margin: { top: 48, right: 52, bottom: 48, left: 52 },
      name: { size: 22, align: "left", uppercase: false, color: "#0f766e" },
      headline: { size: 11, italic: false },
      contact: { size: 9.5, align: "left", separator: "   •   " },
      heading: { size: 10, uppercase: true, color: "#0f766e", rule: "full", ruleColor: "#d4d4d8", ruleWidth: 0.6, spaceBefore: 13, spaceAfter: 6 },
      body: { size: 9.8, lineHeight: 1.36, color: "#1f2937", muted: "#6b7280" },
      bullet: "–",
      skills: "grouped",
      coursework: "inline",
      entryOrder: "title",
      showTechLine: true,
      entryGap: 7,
      order: ["summary", "skills", "experience", "internships", "projects", "education", "certifications", "achievements", "coursework", "extra"],
      titles: { ...TITLES, summary: "Profile" },
    },
  },
  {
    id: "software",
    name: "Technical / Software Engineer",
    useCase: "Developers, Python and AI engineers, technical candidates",
    characteristics: ["Technical skills section first", "Project tech stacks on their own line", "Compact, dense layout"],
    style: {
      family: "helvetica",
      margin: { top: 40, right: 44, bottom: 40, left: 44 },
      name: { size: 19, align: "left", uppercase: false, color: "#111827" },
      headline: { size: 10.5, italic: false },
      contact: { size: 9.5, align: "left", separator: "  |  " },
      heading: { size: 10.5, uppercase: true, color: "#111827", rule: "full", ruleColor: "#374151", ruleWidth: 0.7, spaceBefore: 10, spaceAfter: 4 },
      body: { size: 9.6, lineHeight: 1.28, color: "#111827", muted: "#4b5563" },
      bullet: "•",
      skills: "grouped",
      coursework: "inline",
      entryOrder: "title",
      showTechLine: true,
      entryGap: 5,
      order: ["summary", "skills", "experience", "projects", "internships", "education", "certifications", "achievements", "coursework", "extra"],
      titles: { ...TITLES, summary: "Summary", skills: "Technical Skills" },
    },
  },
  {
    id: "graduate",
    name: "Graduate / Fresher",
    useCase: "Freshers, recent graduates and entry-level candidates",
    characteristics: ["Education and coursework first", "Projects and internships before work history", "Blue section rules"],
    style: {
      family: "helvetica",
      margin: MARGIN,
      name: { size: 20, align: "center", uppercase: false, color: "#111827" },
      headline: { size: 10.5, italic: false },
      contact: { size: 9.5, align: "center", separator: "  |  " },
      heading: { size: 10.5, uppercase: false, color: "#1d4ed8", rule: "full", ruleColor: "#1d4ed8", ruleWidth: 0.8, spaceBefore: 11, spaceAfter: 5 },
      body: { size: 9.8, lineHeight: 1.32, color: "#111827", muted: "#4b5563" },
      bullet: "•",
      skills: "grouped",
      coursework: "inline",
      entryOrder: "title",
      showTechLine: true,
      entryGap: 6,
      order: ["summary", "education", "coursework", "projects", "internships", "experience", "skills", "certifications", "achievements", "extra"],
      titles: { ...TITLES, summary: "Objective", projects: "Academic & Personal Projects" },
    },
  },
  {
    id: "executive",
    name: "Experienced Professional",
    useCase: "Candidates with substantial employment history and leadership",
    characteristics: ["Prominent professional summary", "Core competencies and key achievements up front", "Employer-led career progression"],
    style: {
      family: "times",
      margin: { top: 50, right: 54, bottom: 50, left: 54 },
      name: { size: 24, align: "center", uppercase: true, color: "#1e3a5f" },
      headline: { size: 12, italic: true },
      contact: { size: 10, align: "center", separator: "   ·   " },
      heading: { size: 12, uppercase: true, color: "#1e3a5f", rule: "full", ruleColor: "#1e3a5f", ruleWidth: 1.2, spaceBefore: 13, spaceAfter: 6 },
      body: { size: 10.8, lineHeight: 1.3, color: "#111111", muted: "#4a4a4a" },
      bullet: "•",
      skills: "inline",
      coursework: "inline",
      entryOrder: "organization",
      showTechLine: false,
      entryGap: 8,
      order: ["summary", "skills", "achievements", "experience", "internships", "projects", "education", "certifications", "coursework", "extra"],
      titles: {
        ...TITLES,
        summary: "Executive Summary",
        skills: "Core Competencies",
        achievements: "Key Achievements",
        experience: "Professional Experience",
      },
    },
  },
];

export function getTemplate(id: string | undefined): TemplateInfo {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0]!;
}

export function isTemplateId(id: unknown): id is TemplateId {
  return typeof id === "string" && TEMPLATES.some((t) => t.id === id);
}
