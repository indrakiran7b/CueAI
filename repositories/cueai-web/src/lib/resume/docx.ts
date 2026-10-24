import { PAGE, type DocBlock, type DocRun, type ResumeLayout } from "./layout";
import { getTemplate, type Family } from "./templates";

/** Word fonts that share metrics with the PDF's standard fonts, so lines wrap the same way. */
const WORD_FONT: Record<Family, string> = { helvetica: "Arial", times: "Times New Roman" };

const twips = (pt: number) => Math.max(0, Math.round(pt * 20));
const halfPoints = (pt: number) => Math.round(pt * 2);
const hex = (color: string) => color.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6);

function escapeXml(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runXml(run: DocRun, size: number, color: string, font: string) {
  const bold = run.font === "bold" || run.font === "boldItalic";
  const italic = run.font === "italic" || run.font === "boldItalic";
  return (
    `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` +
    `${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}` +
    `<w:color w:val="${hex(run.color || color)}"/><w:sz w:val="${halfPoints(size)}"/><w:szCs w:val="${halfPoints(size)}"/></w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`
  );
}

const TAB = "<w:r><w:tab/></w:r>";

/** `word/document.xml` for the layout: one Word paragraph per resume paragraph, same order, spacing and page breaks. */
export function resumeDocumentXml(layout: ResumeLayout): string {
  const style = getTemplate(layout.templateId).style;
  const font = WORD_FONT[style.family];
  const contentWidth = PAGE.width - style.margin.left - style.margin.right;
  const body: string[] = [];
  let prev: DocBlock | null = null;

  for (const b of layout.blocks) {
    const hasText = b.runs.some((r) => r.text.trim()) || b.right?.text.trim();
    if (!hasText) continue;
    const newPage = prev !== null && b.page > prev.page;
    const before = prev && !newPage ? b.top - prev.bottom : 0;
    const props: string[] = [];
    if (newPage) props.push("<w:pageBreakBefore/>");
    if (b.kind === "heading" || b.kind === "split") props.push("<w:keepNext/>");
    props.push("<w:keepLines/>");
    if (b.rule) {
      props.push(
        `<w:pBdr><w:bottom w:val="single" w:sz="${Math.max(2, Math.round(b.rule.width * 8))}" w:space="1" w:color="${hex(b.rule.color)}"/></w:pBdr>`,
      );
    }
    if (b.kind === "split" && b.right) props.push(`<w:tabs><w:tab w:val="right" w:pos="${twips(contentWidth)}"/></w:tabs>`);
    props.push(`<w:spacing w:before="${twips(before)}" w:after="0" w:line="${twips(b.lineHeight)}" w:lineRule="exact"/>`);
    if (b.kind === "bullet") {
      const hang = b.hang ?? b.size;
      props.push(`<w:ind w:left="${twips(b.indent + hang)}" w:hanging="${twips(hang)}"/>`);
    } else if (b.indent) {
      props.push(`<w:ind w:left="${twips(b.indent)}"/>`);
    }
    if (b.align === "center") props.push('<w:jc w:val="center"/>');

    const runs: string[] = [];
    if (b.kind === "bullet" && b.glyph) runs.push(runXml({ text: b.glyph, font: "regular" }, b.size, b.color, font), TAB);
    for (const r of b.runs) if (r.text) runs.push(runXml(r, b.size, b.color, font));
    if (b.kind === "split" && b.right?.text) {
      runs.push(TAB, runXml({ text: b.right.text, font: b.right.font, color: b.right.color }, b.size, b.color, font));
    }
    body.push(`<w:p><w:pPr>${props.join("")}</w:pPr>${runs.join("")}</w:p>`);
    prev = b;
  }

  const m = style.margin;
  const sect =
    `<w:sectPr><w:pgSz w:w="${twips(PAGE.width)}" w:h="${twips(PAGE.height)}"/>` +
    `<w:pgMar w:top="${twips(m.top)}" w:right="${twips(m.right)}" w:bottom="${twips(m.bottom)}" w:left="${twips(m.left)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body.join("")}${sect}</w:body></w:document>`
  );
}
