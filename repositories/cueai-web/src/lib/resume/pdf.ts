import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { layoutResume, type FontStyle, type Measurer, type ResumeLayout } from "./layout";
import type { Family } from "./templates";
import type { StructuredResume } from "./types";

type FontSet = Record<Family, Record<FontStyle, PDFFont>>;

const FONT_NAMES: Record<Family, Record<FontStyle, StandardFonts>> = {
  helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
};

/** Common characters outside WinAnsi, mapped to close equivalents. */
const REPLACE: Record<string, string> = {
  "\u00a0": " ",
  "\u2009": " ",
  "\u202f": " ",
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2015": "-",
  "\u2212": "-",
  "\u2192": "->",
  "\u2190": "<-",
  "\u21d2": "=>",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2248": "~",
  "\u2713": "",
  "\u2714": "",
  "\u25cf": "\u2022",
  "\u25aa": "\u2022",
  "\u25e6": "\u2022",
  "\u2023": "\u2022",
  "\u2043": "-",
  "\u20b9": "Rs.",
  "\u2032": "'",
  "\u2033": '"',
  "\ufb01": "fi",
  "\ufb02": "fl",
};

async function embedFonts(doc: PDFDocument): Promise<FontSet> {
  const out = {} as FontSet;
  for (const family of Object.keys(FONT_NAMES) as Family[]) {
    out[family] = {} as Record<FontStyle, PDFFont>;
    for (const style of Object.keys(FONT_NAMES[family]) as FontStyle[]) {
      out[family][style] = await doc.embedFont(FONT_NAMES[family][style]);
    }
  }
  return out;
}

export type ResumeMeasurer = Measurer & { unsupported: Set<string> };

function makeMeasurer(fonts: FontSet): ResumeMeasurer {
  const charset = new Set(fonts.helvetica.regular.getCharacterSet());
  const unsupported = new Set<string>();
  const cache = new Map<string, string>();
  const clean = (text: string) => {
    const hit = cache.get(text);
    if (hit != null) return hit;
    let out = "";
    for (const ch of text.replace(/[\t\r\n]+/g, " ")) {
      const cp = ch.codePointAt(0)!;
      if (charset.has(cp)) {
        out += ch;
        continue;
      }
      if (ch in REPLACE) {
        out += REPLACE[ch];
        continue;
      }
      const base = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      if (base && [...base].every((c) => charset.has(c.codePointAt(0)!))) {
        out += base;
        continue;
      }
      unsupported.add(ch);
      out += "?";
    }
    if (cache.size > 5000) cache.clear();
    cache.set(text, out);
    return out;
  };
  return {
    unsupported,
    clean,
    width: (text, family, font, size) => fonts[family][font].widthOfTextAtSize(clean(text), size),
  };
}

let sharedMeasurer: Promise<ResumeMeasurer> | null = null;

/** Font metrics for layout (preview) without writing a document. */
export function getMeasurer(): Promise<ResumeMeasurer> {
  if (!sharedMeasurer) {
    sharedMeasurer = PDFDocument.create()
      .then(embedFonts)
      .then(makeMeasurer)
      .catch((err) => {
        sharedMeasurer = null;
        throw err;
      });
  }
  return sharedMeasurer;
}

function hexColor(hex: string) {
  const v = hex.replace("#", "");
  const n = parseInt(v.length === 3 ? v.replace(/./g, "$&$&") : v, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function resumeFileName(name: string, ext: "pdf" | "docx" = "pdf") {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${base ? `${base}_` : ""}ATS_Resume.${ext}`;
}

export type BuiltPdf = { bytes: Uint8Array; layout: ResumeLayout; unsupported: string[] };

/** Lay out and write the resume as a PDF with real, selectable text (standard fonts). */
export async function buildResumePdf(resume: StructuredResume, templateId: string): Promise<BuiltPdf> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const measurer = makeMeasurer(fonts);
  const layout = layoutResume(resume, templateId, measurer);

  for (const p of layout.pages) {
    const page = doc.addPage([layout.width, layout.height]);
    for (const op of p.ops) {
      if (op.kind === "text") {
        page.drawText(measurer.clean(op.text), {
          x: op.x,
          y: layout.height - op.y,
          size: op.size,
          font: fonts[op.family][op.font],
          color: hexColor(op.color),
        });
      } else {
        page.drawLine({
          start: { x: op.x1, y: layout.height - op.y },
          end: { x: op.x2, y: layout.height - op.y },
          thickness: op.width,
          color: hexColor(op.color),
        });
      }
    }
  }

  const title = resume.name ? `${resume.name} - Resume` : "Resume";
  doc.setTitle(measurer.clean(title));
  if (resume.name) doc.setAuthor(measurer.clean(resume.name));
  doc.setSubject("ATS resume");
  doc.setCreator("CueAI Resume Tailor");
  doc.setProducer("CueAI Resume Tailor");
  const bytes = await doc.save();
  return { bytes, layout, unsupported: [...measurer.unsupported] };
}
