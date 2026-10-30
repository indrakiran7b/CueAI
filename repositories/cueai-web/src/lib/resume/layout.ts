/**
 * Resume layout engine. Produces positioned text and rules per page; the same
 * output is drawn by the PDF writer and by the on-screen preview, so the
 * preview is the downloaded document.
 */
import { getTemplate, type Family, type SectionKey, type TemplateStyle } from "./templates";
import type { ResumeEntry, ResumeProject, StructuredResume } from "./types";

export const PAGE = { width: 595.28, height: 841.89 };

export type FontStyle = "regular" | "bold" | "italic" | "boldItalic";

export type TextOp = {
  kind: "text";
  x: number;
  /** Baseline, measured from the top of the page. */
  y: number;
  text: string;
  size: number;
  family: Family;
  font: FontStyle;
  color: string;
  width: number;
};

export type RuleOp = { kind: "rule"; x1: number; y: number; x2: number; width: number; color: string };

export type LayoutPage = { ops: (TextOp | RuleOp)[] };

export type DocRun = { text: string; font: FontStyle; color?: string };

/**
 * One logical paragraph of the laid-out resume (original, unwrapped text), with the page
 * and vertical span it occupies. Editable exports rebuild the same document from these.
 */
export type DocBlock = {
  kind: "heading" | "paragraph" | "bullet" | "split";
  runs: DocRun[];
  size: number;
  lineHeight: number;
  color: string;
  align: "left" | "center";
  indent: number;
  /** Bullets: glyph and hanging indent. */
  glyph?: string;
  hang?: number;
  /** Split lines: right-aligned text on the first line. */
  right?: { text: string; font: FontStyle; color: string };
  rule?: { color: string; width: number };
  page: number;
  top: number;
  bottom: number;
};

export type ResumeLayout = {
  width: number;
  height: number;
  pages: LayoutPage[];
  blocks: DocBlock[];
  templateId: string;
  /** 0 = the template's own spacing; higher levels tighten spacing (and at 3, text size) to fit fewer pages. */
  density: number;
  /** The exact style used, so every export reproduces the same document. */
  style: TemplateStyle;
};

export const MAX_DENSITY = 3;

/**
 * Template style at a density level. Spacing tightens first; only level 3 reduces text size,
 * and body text never goes below 9.4 pt.
 */
export function densityStyle(base: TemplateStyle, level: number): TemplateStyle {
  if (level <= 0) return base;
  const s = JSON.parse(JSON.stringify(base)) as TemplateStyle;
  s.heading.spaceBefore = +(base.heading.spaceBefore * 0.72).toFixed(2);
  s.heading.spaceAfter = +(base.heading.spaceAfter * 0.8).toFixed(2);
  s.entryGap = +(base.entryGap * 0.6).toFixed(2);
  s.body.lineHeight = Math.max(1.2, +(base.body.lineHeight - 0.04).toFixed(3));
  if (level >= 2) {
    s.margin = {
      top: Math.max(34, Math.round(base.margin.top * 0.82)),
      right: Math.max(36, Math.round(base.margin.right * 0.85)),
      bottom: Math.max(34, Math.round(base.margin.bottom * 0.82)),
      left: Math.max(36, Math.round(base.margin.left * 0.85)),
    };
    s.name.size = base.name.size - 2;
    s.body.lineHeight = Math.max(1.17, +(base.body.lineHeight - 0.07).toFixed(3));
  }
  if (level >= 3) {
    s.body.size = Math.max(9.4, +(base.body.size - 0.5).toFixed(2));
    s.heading.size = Math.max(9.5, +(base.heading.size - 0.5).toFixed(2));
    s.contact.size = Math.max(8.8, +(base.contact.size - 0.3).toFixed(2));
  }
  return s;
}

export type Measurer = {
  width(text: string, family: Family, font: FontStyle, size: number): number;
  /** Map text to characters the PDF fonts can encode. */
  clean(text: string): string;
};

type Run = { text: string; font: FontStyle; color?: string };
type Line = { runs: Run[]; width: number };

const ASCENT = 0.78;

type BlockInit = Omit<DocBlock, "page" | "top" | "bottom">;

class Writer {
  pages: LayoutPage[] = [];
  blocks: DocBlock[] = [];
  y = 0;
  private page: LayoutPage | null = null;
  private open: DocBlock | null = null;

  constructor(
    private m: Measurer,
    private s: TemplateStyle,
  ) {}

  get left() {
    return this.s.margin.left;
  }
  get right() {
    return PAGE.width - this.s.margin.right;
  }
  get contentWidth() {
    return this.right - this.left;
  }
  private get bottom() {
    return PAGE.height - this.s.margin.bottom;
  }

  private current(): LayoutPage {
    if (!this.page) {
      this.page = { ops: [] };
      this.pages.push(this.page);
      this.y = this.s.margin.top;
    }
    return this.page;
  }

  /** Start a new page unless `height` still fits on this one. */
  ensure(height: number) {
    this.current();
    if (this.y + height > this.bottom && this.y > this.s.margin.top + 0.5) {
      this.page = null;
      this.current();
    }
  }

  lineHeight(size: number) {
    return size * this.s.body.lineHeight;
  }

  begin(block: BlockInit) {
    this.open = { ...block, page: -1, top: 0, bottom: 0 };
    this.blocks.push(this.open);
  }

  /** Call after a line's page break is resolved: the block starts where its first line lands. */
  lineStarted() {
    if (this.open && this.open.page < 0) {
      this.current();
      this.open.page = this.pages.length - 1;
      this.open.top = this.y;
    }
  }

  end() {
    if (!this.open) return;
    this.lineStarted();
    this.open.bottom = this.y;
    this.open = null;
  }

  measure(text: string, font: FontStyle, size: number) {
    return this.m.width(text, this.s.family, font, size);
  }

  text(x: number, baseline: number, text: string, font: FontStyle, size: number, color: string) {
    if (!text) return;
    const width = this.measure(text, font, size);
    this.current().ops.push({ kind: "text", x, y: baseline, text, size, family: this.s.family, font, color, width });
  }

  rule(y: number, color: string, width: number, x1 = this.left, x2 = this.right) {
    this.current().ops.push({ kind: "rule", x1, y, x2, width, color });
  }

  /** Greedy word wrap over runs of mixed fonts. Very long words are broken by character. */
  wrap(runs: Run[], size: number, maxWidth: number): Line[] {
    const lines: Line[] = [];
    let line: Run[] = [];
    let width = 0;
    const space = (font: FontStyle) => this.measure(" ", font, size);
    const push = () => {
      if (line.length) lines.push({ runs: line, width });
      line = [];
      width = 0;
    };
    for (const run of runs) {
      const clean = this.m.clean(run.text);
      const tokens = clean.split(/(\s+)/).filter((t) => t.length);
      for (const token of tokens) {
        if (/^\s+$/.test(token)) {
          if (width > 0) {
            const last = line[line.length - 1];
            if (last && last.font === run.font && last.color === run.color) last.text += " ";
            else line.push({ ...run, text: " " });
            width += space(run.font);
          }
          continue;
        }
        let word = token;
        let w = this.measure(word, run.font, size);
        while (w > maxWidth) {
          // Break an unbreakable token (URL, long identifier) across lines.
          let cut = word.length - 1;
          while (cut > 1 && this.measure(word.slice(0, cut), run.font, size) > maxWidth - width) cut--;
          if (width > 0 && cut <= 1) {
            trimTrailing(line, this, size);
            push();
            continue;
          }
          appendRun(line, { ...run, text: word.slice(0, cut) });
          width += this.measure(word.slice(0, cut), run.font, size);
          trimTrailing(line, this, size);
          push();
          word = word.slice(cut);
          w = this.measure(word, run.font, size);
        }
        if (width + w > maxWidth && width > 0) {
          width -= trimTrailing(line, this, size);
          push();
        }
        appendRun(line, { ...run, text: word });
        width += w;
      }
    }
    width -= trimTrailing(line, this, size);
    push();
    return lines;
  }

  drawLines(lines: Line[], x: number, size: number, color: string, align: "left" | "center" = "left", maxWidth = this.contentWidth) {
    const lh = this.lineHeight(size);
    for (const line of lines) {
      this.ensure(lh);
      this.lineStarted();
      let cx = align === "center" ? x + (maxWidth - line.width) / 2 : x;
      const baseline = this.y + size * ASCENT;
      for (const run of line.runs) {
        this.text(cx, baseline, run.text, run.font, size, run.color || color);
        cx += this.measure(run.text, run.font, size);
      }
      this.y += lh;
    }
  }

  paragraph(runs: Run[], opts: { size?: number; color?: string; indent?: number; align?: "left" | "center" } = {}) {
    const size = opts.size ?? this.s.body.size;
    const indent = opts.indent ?? 0;
    const color = opts.color ?? this.s.body.color;
    const align = opts.align ?? "left";
    this.begin({ kind: "paragraph", runs, size, lineHeight: this.lineHeight(size), color, align, indent });
    const lines = this.wrap(runs, size, this.contentWidth - indent);
    this.drawLines(lines, this.left + indent, size, color, align, this.contentWidth - indent);
    this.end();
  }

  bullet(text: string, indent = 0) {
    const size = this.s.body.size;
    const glyph = this.m.clean(this.s.bullet);
    const hang = Math.max(this.measure(`${glyph} `, "regular", size), size * 0.9);
    const x = this.left + indent;
    const lines = this.wrap([{ text, font: "regular" }], size, this.contentWidth - indent - hang);
    const lh = this.lineHeight(size);
    this.begin({
      kind: "bullet",
      runs: [{ text, font: "regular" }],
      size,
      lineHeight: lh,
      color: this.s.body.color,
      align: "left",
      indent,
      glyph: this.s.bullet,
      hang,
    });
    lines.forEach((line, i) => {
      this.ensure(lh);
      this.lineStarted();
      const baseline = this.y + size * ASCENT;
      if (i === 0) this.text(x, baseline, glyph, "regular", size, this.s.body.color);
      let cx = x + hang;
      for (const run of line.runs) {
        this.text(cx, baseline, run.text, run.font, size, this.s.body.color);
        cx += this.measure(run.text, run.font, size);
      }
      this.y += lh;
    });
    this.end();
  }

  /** Left content with a right-aligned date on the first line. */
  splitLine(left: Run[], right: string, size: number, rightFont: FontStyle = "regular") {
    const r = this.m.clean(right);
    const rw = r ? this.measure(r, rightFont, size) : 0;
    const gap = r ? 12 : 0;
    const lines = this.wrap(left, size, this.contentWidth - rw - gap);
    const lh = this.lineHeight(size);
    this.begin({
      kind: "split",
      runs: left,
      size,
      lineHeight: lh,
      color: this.s.body.color,
      align: "left",
      indent: 0,
      right: right ? { text: right, font: rightFont, color: this.s.body.muted } : undefined,
    });
    lines.forEach((line, i) => {
      this.ensure(lh);
      this.lineStarted();
      const baseline = this.y + size * ASCENT;
      let cx = this.left;
      for (const run of line.runs) {
        this.text(cx, baseline, run.text, run.font, size, run.color || this.s.body.color);
        cx += this.measure(run.text, run.font, size);
      }
      if (i === 0 && r) this.text(this.right - rw, baseline, r, rightFont, size, this.s.body.muted);
      this.y += lh;
    });
    if (!lines.length && r) {
      this.ensure(lh);
      this.lineStarted();
      this.text(this.right - rw, this.y + size * ASCENT, r, rightFont, size, this.s.body.muted);
      this.y += lh;
    }
    this.end();
  }
}

function appendRun(line: Run[], run: Run) {
  const last = line[line.length - 1];
  if (last && last.font === run.font && last.color === run.color) last.text += run.text;
  else line.push({ ...run });
}

function trimTrailing(line: Run[], w: Writer, size: number): number {
  let removed = 0;
  while (line.length) {
    const last = line[line.length - 1]!;
    const trimmed = last.text.replace(/\s+$/, "");
    if (trimmed.length === last.text.length) break;
    removed += w.measure(last.text, last.font, size) - w.measure(trimmed, last.font, size);
    if (trimmed) {
      last.text = trimmed;
      break;
    }
    line.pop();
  }
  return removed;
}

function sectionHasContent(r: StructuredResume, key: SectionKey): boolean {
  switch (key) {
    case "summary":
      return Boolean(r.summary);
    case "skills":
      return r.skills.some((g) => g.items.length);
    case "experience":
      return r.experience.length > 0;
    case "internships":
      return r.internships.length > 0;
    case "projects":
      return r.projects.length > 0;
    case "education":
      return r.education.length > 0;
    case "certifications":
      return r.certifications.length > 0;
    case "achievements":
      return r.achievements.length > 0;
    case "coursework":
      return r.coursework.length > 0;
    case "extra":
      return r.extra.length > 0;
  }
}

function heading(w: Writer, s: TemplateStyle, title: string) {
  const size = s.heading.size;
  const text = s.heading.uppercase ? title.toUpperCase() : title;
  // Keep the heading with at least two lines of its content.
  w.ensure(s.heading.spaceBefore + size * 1.3 + s.heading.spaceAfter + w.lineHeight(s.body.size) * 2);
  if (w.y > s.margin.top + 1) w.y += s.heading.spaceBefore;
  w.begin({
    kind: "heading",
    runs: [{ text, font: "bold" }],
    size,
    lineHeight: size * 1.2,
    color: s.heading.color,
    align: "left",
    indent: 0,
    rule: s.heading.rule === "full" ? { color: s.heading.ruleColor, width: s.heading.ruleWidth } : undefined,
  });
  w.lineStarted();
  const baseline = w.y + size * ASCENT;
  w.text(w.left, baseline, text, "bold", size, s.heading.color);
  w.y += size * 1.2;
  if (s.heading.rule === "full") {
    w.rule(w.y, s.heading.ruleColor, s.heading.ruleWidth);
    w.y += s.heading.ruleWidth;
  }
  w.end();
  w.y += s.heading.spaceAfter;
}

function entry(w: Writer, s: TemplateStyle, e: ResumeEntry) {
  const size = s.body.size;
  w.ensure(w.lineHeight(size) * (e.bullets.length ? 3 : 2));
  if (s.entryOrder === "organization" && e.organization) {
    w.splitLine([{ text: e.organization, font: "bold" }], e.dates, size);
    const second: Run[] = [];
    if (e.title) second.push({ text: e.title, font: "italic" });
    if (second.length || e.location) w.splitLine(second, e.location, size, "italic");
  } else {
    const left: Run[] = [];
    if (e.title) left.push({ text: e.title, font: "bold" });
    if (e.organization) left.push({ text: `${e.title ? ", " : ""}${e.organization}`, font: e.title ? "regular" : "bold" });
    w.splitLine(left, e.dates, size);
    if (e.location) w.paragraph([{ text: e.location, font: "italic" }], { color: s.body.muted });
  }
  for (const b of e.bullets) w.bullet(b, 4);
}

function project(w: Writer, s: TemplateStyle, p: ResumeProject) {
  const size = s.body.size;
  w.ensure(w.lineHeight(size) * (p.bullets.length ? 3 : 2));
  const left: Run[] = [{ text: p.name, font: "bold" }];
  if (p.tech && !s.showTechLine) left.push({ text: ` | ${p.tech}`, font: "italic" });
  w.splitLine(left, p.dates, size);
  if (p.tech && s.showTechLine) w.paragraph([{ text: "Tech: ", font: "bold" }, { text: p.tech, font: "italic" }], { color: s.body.muted });
  if (p.link) w.paragraph([{ text: p.link, font: "regular" }], { color: s.body.muted });
  for (const b of p.bullets) w.bullet(b, 4);
}

function section(w: Writer, s: TemplateStyle, r: StructuredResume, key: SectionKey) {
  if (!sectionHasContent(r, key)) return;
  const gap = s.entryGap;
  if (key === "extra") {
    for (const sec of r.extra) {
      heading(w, s, sec.heading);
      for (const item of sec.items) w.bullet(item);
    }
    return;
  }
  heading(w, s, s.titles[key]);
  switch (key) {
    case "summary":
      w.paragraph([{ text: r.summary, font: "regular" }]);
      break;
    case "skills": {
      const groups = r.skills.filter((g) => g.items.length);
      if (s.skills === "inline") {
        w.paragraph([{ text: groups.flatMap((g) => g.items).join("  |  "), font: "regular" }]);
      } else {
        for (const g of groups) {
          w.paragraph(g.label ? [{ text: `${g.label}: `, font: "bold" }, { text: g.items.join(", "), font: "regular" }] : [{ text: g.items.join(", "), font: "regular" }]);
        }
      }
      break;
    }
    case "experience":
    case "internships":
    case "education": {
      const list = r[key];
      list.forEach((e, i) => {
        if (i) w.y += gap;
        entry(w, s, e);
      });
      break;
    }
    case "projects":
      r.projects.forEach((p, i) => {
        if (i) w.y += gap;
        project(w, s, p);
      });
      break;
    case "certifications":
      for (const c of r.certifications) w.bullet(c);
      break;
    case "achievements":
      for (const a of r.achievements) w.bullet(a);
      break;
    case "coursework":
      if (s.coursework === "inline") w.paragraph([{ text: r.coursework.join(", "), font: "regular" }]);
      else for (const c of r.coursework) w.bullet(c);
      break;
  }
}

/** Template section order; tailoring's projects-first hint moves projects ahead of work history. */
export function sectionOrder(s: TemplateStyle, resume: StructuredResume): SectionKey[] {
  if (!resume.projectsFirst) return s.order;
  const order: SectionKey[] = s.order.filter((k) => k !== "projects");
  const first = order.findIndex((k) => k === "experience" || k === "internships");
  if (first < 0 || s.order.indexOf("projects") < s.order.indexOf(order[first]!)) return s.order;
  order.splice(first, 0, "projects");
  return order;
}

export function layoutResume(resume: StructuredResume, templateId: string, m: Measurer, density = 0): ResumeLayout {
  const t = getTemplate(templateId);
  const level = Math.max(0, Math.min(MAX_DENSITY, Math.round(density)));
  const s = densityStyle(t.style, level);
  const w = new Writer(m, s);

  // Header
  const name = s.name.uppercase ? resume.name.toUpperCase() : resume.name;
  if (name) {
    w.paragraph([{ text: name, font: "bold", color: s.name.color }], { size: s.name.size, align: s.name.align });
    w.y += 2;
  }
  if (resume.headline) {
    w.paragraph([{ text: resume.headline, font: s.headline.italic ? "italic" : "regular" }], {
      size: s.headline.size,
      align: s.name.align,
      color: s.body.muted,
    });
  }
  const contact = [resume.contact.email, resume.contact.phone, resume.contact.location, ...resume.contact.links].filter(Boolean);
  if (contact.length) {
    w.paragraph([{ text: contact.join(s.contact.separator), font: "regular" }], {
      size: s.contact.size,
      align: s.contact.align,
      color: s.body.muted,
    });
  }

  for (const key of sectionOrder(s, resume)) section(w, s, resume, key);

  if (!w.pages.length) w.ensure(0);
  return { width: PAGE.width, height: PAGE.height, pages: w.pages, blocks: w.blocks, templateId: t.id, density: level, style: s };
}

