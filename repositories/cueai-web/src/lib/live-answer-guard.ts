import type { QuestionAnalysis } from "@/lib/live-question";

/**
 * Deterministic checks on a finished live answer, applied before it is returned or stored.
 * No model call and no code execution: code is only checked statically, so a passing
 * result is reported as "static_ok", never as "tests passed".
 */

export type CodeValidationStatus = "not_applicable" | "static_ok" | "static_issues";

export type GuardResult = {
  answer: string;
  /** Short machine labels for what was changed (safe to log; contain no answer text). */
  changes: string[];
  validationStatus: CodeValidationStatus;
  /** Static code issues, e.g. "line 4: expected an indented block". */
  issues: string[];
};

type GuardOptions = {
  analysis?: Pick<QuestionAnalysis, "responseType" | "language" | "needsPersonalContext">;
  /** Everything the answer may legitimately draw on: resume, profile, KB, earlier answers. */
  context?: string;
};

const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]"],
  [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g, "[redacted]"],
  [/\bgsk_[A-Za-z0-9]{20,}/g, "[redacted]"],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, "[redacted]"],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, "[redacted]"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/g, "[redacted]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]"],
  [/(\bBearer\s+)[A-Za-z0-9._~+/-]{20,}=*/gi, "$1[redacted]"],
];

export function redactSecrets(text: string): { text: string; redacted: boolean } {
  let out = text;
  for (const [re, replacement] of SECRET_PATTERNS) out = out.replace(re, replacement);
  return { text: out, redacted: out !== text };
}

const PREAMBLE =
  /^\s*(?:(?:sure|certainly|of course|absolutely|great question|good question|that's a (?:great|good) question|okay|ok)[,.!:]?\s+)+(?:here(?:'s| is) (?:the|my|an?) (?:answer|response|explanation)[^.:\n]*[.:]\s*)?|^\s*here(?:'s| is) (?:the|my|an?) (?:answer|response|explanation)[^.:\n]*[.:]\s*/i;

function stripPreamble(text: string): string {
  const stripped = text.replace(PREAMBLE, "");
  if (stripped === text || !stripped.trim()) return text;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

const PLACEHOLDER_ORG =
  /,?\s+(?:at|from|with|in) (?:the )?((?:XYZ|ABC|PQR|XXX|Acme)(?: [A-Z][a-z]+)? (?:University|College|Institute(?: of Technology)?|School|Company|Corp(?:oration)?|Inc\.?|Technologies|Solutions|Labs|Pvt\.? Ltd\.?))(?=\W)/g;

/** Drops invented placeholder institutions ("at XYZ University") that the context doesn't contain. */
function removePlaceholders(text: string, ctx: string): string {
  return text.replace(PLACEHOLDER_ORG, (match, org: string) => (ctx.includes(org) ? match : ""));
}

const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|my|me|we|we've|our)\b/i;
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};
const BIG_EMPLOYERS =
  "Google|Amazon|Microsoft|Meta|Facebook|Apple|Netflix|Infosys|TCS|Tata Consultancy Services|Wipro|Accenture|Cognizant|Deloitte|IBM|Oracle|Capgemini|HCL|Flipkart|Adobe|Salesforce|Uber";

const PROJECT_SUBJECT = /\b(it|this|the (project|app|application|system|tool|model|analy[sz]er|platform|website|api))\b/i;

/**
 * Returns a reason when a sentence claims something about the candidate the context doesn't support.
 * First-person sentences are always checked; "it / the project" sentences only for personal questions,
 * so general facts ("Python 3.11 is 25% faster") are left alone.
 */
function unsupportedClaim(sentence: string, ctx: string, personal: boolean): string | null {
  const firstPerson = FIRST_PERSON.test(sentence);
  if (!firstPerson) {
    if (!personal || !PROJECT_SUBJECT.test(sentence)) return null;
    return unsupportedScale(sentence, ctx);
  }

  const years = sentence.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|many)\+?\s*(?:\+\s*)?(?:years?|yrs?)\b/i,
  );
  if (years && /\b(experience|experienced|working|worked|been|industry|professional|career|developer|engineer)\b/i.test(sentence)) {
    const n = NUMBER_WORDS[years[1]!.toLowerCase()] || years[1]!.toLowerCase();
    const supported = /^\d+$/.test(n)
      ? new RegExp(`\\b${n}\\+?\\s*(years?|yrs?)\\b`, "i").test(ctx)
      : /\b\d+\+?\s*(years?|yrs?)\b/i.test(ctx);
    if (!supported) return "years";
  }

  const scaleReason = unsupportedScale(sentence, ctx);
  if (scaleReason) return scaleReason;

  if (
    /\b(i|we)\s+((also|have|had|then)\s+)?(led|managed|mentored|supervised|headed)\b|\b(led|managed|headed) (a|the|my|our)( \w+)? (team|group|squad)\b|\bteam lead\b|\bas (the )?(team )?lead\b/i.test(sentence) &&
    !/\b(led|lead|managed|mentored|supervised|headed)\b/i.test(ctx)
  ) {
    return "leadership";
  }

  const employer = sentence.match(
    new RegExp(
      `\\b(work(?:ed|ing)?|intern(?:ed|ing|ship)?|employed|joined|role|position|job)\\b[^.]{0,25}\\b(?:at|for|with)\\s+(${BIG_EMPLOYERS})\\b(?!\\s+(?:cloud|gemini|api|apis|colab|maps|drive|services|sdk|web services|azure))`,
      "i",
    ),
  );
  if (employer && !new RegExp(`\\b${employer[2]}\\b`, "i").test(ctx)) return "employer";

  return null;
}

function unsupportedScale(sentence: string, ctx: string): string | null {
  for (const m of sentence.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s?(%|percent\b)/gi)) {
    if (!new RegExp(`\\b${m[1]!.replace(".", "\\.")}\\s?(%|percent)`, "i").test(ctx)) return "metric";
  }
  const scale = sentence.match(
    /\b(millions?|thousands?|hundreds?|lakhs?) of (users|customers|clients|people|requests|students|recruiters|records|transactions)\b|\b(\d[\d,.]*\s?(?:k|m|million|thousand)?)\+?\s+(?:active |daily |monthly |concurrent )?(users|customers|clients|downloads|requests per)\b/i,
  );
  if (scale) {
    const token = (scale[1] || scale[3] || "").trim().toLowerCase();
    if (!token || !ctx.toLowerCase().includes(token.replace(/s$/, ""))) return "scale";
  }
  return null;
}

/** Drops unsupported claims from prose, never from code. */
function dropUnsupportedClaims(prose: string, ctx: string, personal: boolean, reasons: Set<string>): string {
  return prose
    .split("\n")
    .map((line) => {
      const sentences = line.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter((s) => {
        const reason = s.trim() ? unsupportedClaim(s, ctx, personal) : null;
        if (reason) reasons.add(reason);
        return !reason;
      });
      return kept.length === sentences.length ? line : kept.join(" ").trim();
    })
    .join("\n");
}

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

const CODE_LINE =
  /^\s*(def |class |for |while |if |elif |else\s*:|try\s*:|except\b|return\b|print\(|import |from \w+ import|function |const |let |var |public |private |#include|[A-Za-z_][\w.[\]]*\s*[+\-*/]?=\s*\S|\}|\{$)/;

/** Wraps an unfenced code run (3+ code-looking lines) in a fenced block. */
function fenceBareCode(text: string, lang: string): string | null {
  const lines = text.split("\n");
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const isCode = CODE_LINE.test(lines[i]!) || (start >= 0 && /^\s{2,}\S/.test(lines[i]!));
    if (isCode) {
      if (start < 0) start = i;
      end = i;
    } else if (start >= 0 && lines[i]!.trim() && end - start >= 2) {
      break;
    } else if (start >= 0 && lines[i]!.trim()) {
      start = -1;
    }
  }
  if (start < 0 || end - start < 2) return null;
  return [
    ...lines.slice(0, start),
    "```" + lang,
    ...lines.slice(start, end + 1),
    "```",
    ...lines.slice(end + 1),
  ].join("\n");
}

const PY_OPENER = /^(async\s+)?(def|class|if|elif|else|for|while|try|except|finally|with)\b/;

function stripPyStrings(code: string): string {
  return code
    .replace(/("""|''')[\s\S]*?\1/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => " ".repeat(m.length));
}

export function checkPythonStatic(code: string): string[] {
  const issues: string[] = [];
  const lines = stripPyStrings(code).split("\n").map((l) => l.replace(/#.*$/, ""));
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const indents = [0];
  let expectIndent = false;
  let openerLine = 0;
  let logicalIsOpener = false;
  let logicalHasColon = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const continuation = stack.length > 0 || /\\\s*$/.test(lines[i - 1] || "");
    if (!continuation) {
      const lead = line.match(/^[ \t]*/)![0];
      if (lead.includes("\t") && lead.includes(" ")) issues.push(`line ${i + 1}: mixed tabs and spaces`);
      const indent = lead.replace(/\t/g, "    ").length;
      const top = indents[indents.length - 1]!;
      if (expectIndent) {
        if (indent <= top) issues.push(`line ${i + 1}: expected an indented block after line ${openerLine}`);
        else indents.push(indent);
      } else if (indent > top) {
        issues.push(`line ${i + 1}: unexpected indent`);
      } else if (indent < top) {
        while (indents.length > 1 && indents[indents.length - 1]! > indent) indents.pop();
        if (indents[indents.length - 1] !== indent) issues.push(`line ${i + 1}: unindent does not match any outer level`);
      }
      expectIndent = false;
      logicalIsOpener = PY_OPENER.test(line.trim());
      logicalHasColon = false;
      openerLine = i + 1;
    }
    for (const ch of line) {
      if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
      else if (ch in pairs) {
        if (stack.pop() !== pairs[ch]) {
          issues.push(`line ${i + 1}: unbalanced '${ch}'`);
          return issues;
        }
      }
    }
    if (line.includes(":")) logicalHasColon = true;
    const logicalEnds = stack.length === 0 && !/\\\s*$/.test(line);
    if (logicalEnds && logicalIsOpener) {
      if (/:\s*$/.test(line)) expectIndent = true;
      else if (!logicalHasColon) issues.push(`line ${openerLine}: missing colon`);
    }
  }
  if (stack.length) issues.push(`unclosed '${stack[stack.length - 1]}'`);
  if (expectIndent) issues.push(`line ${openerLine}: block has no body`);
  return issues.slice(0, 5);
}

export function checkBracesStatic(code: string): string[] {
  const clean = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "");
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  for (const ch of clean) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (ch in pairs && stack.pop() !== pairs[ch]) return [`unbalanced '${ch}'`];
  }
  return stack.length ? [`unclosed '${stack[stack.length - 1]}'`] : [];
}

function checkBlock(lang: string, code: string): string[] {
  const l = lang.trim().toLowerCase();
  if (l === "python" || l === "py" || (!l && /^\s*(def |import |print\(|for .+:\s*$)/m.test(code))) {
    return checkPythonStatic(code);
  }
  if (/^(js|javascript|ts|typescript|java|c|cpp|c\+\+|cs|csharp|c#|go|kotlin|swift|rust|php)$/.test(l)) {
    return checkBracesStatic(code);
  }
  return [];
}

export function guardLiveAnswer(raw: string, opts: GuardOptions = {}): GuardResult {
  const changes: string[] = [];
  let text = raw.trim();

  const secrets = redactSecrets(text);
  if (secrets.redacted) changes.push("secret_redacted");
  text = secrets.text;

  // Non-breaking hyphens and smart quotes break copy-paste, search and Python code.
  const normalized = text
    .replace(/[\u2010\u2011]/g, "-")
    .replace(FENCE, (block) => block.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u2212/g, "-"));
  if (normalized !== text) changes.push("characters_normalized");
  text = normalized;

  const placeholder = removePlaceholders(text, opts.context || "");
  if (placeholder !== text) changes.push("placeholder_removed");
  text = placeholder;

  const noPreamble = stripPreamble(text);
  if (noPreamble !== text) changes.push("preamble_removed");
  text = noPreamble;

  if ((text.match(/```/g) || []).length % 2 === 1) {
    text = `${text}\n\`\`\``;
    changes.push("fence_closed");
  }

  if (opts.analysis?.responseType === "coding" && !text.includes("```")) {
    const lang = (opts.analysis.language || "python").toLowerCase().replace("c++", "cpp").replace("c#", "csharp");
    const fenced = fenceBareCode(text, lang);
    if (fenced) {
      text = fenced;
      changes.push("code_fenced");
    }
  }

  const ctx = opts.context || "";
  const personal = Boolean(opts.analysis?.needsPersonalContext);
  const reasons = new Set<string>();
  const pieces: string[] = [];
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    pieces.push(dropUnsupportedClaims(text.slice(last, m.index), ctx, personal, reasons), m[0]);
    last = m.index! + m[0].length;
  }
  pieces.push(dropUnsupportedClaims(text.slice(last), ctx, personal, reasons));
  const filtered = pieces.join("").replace(/\n{3,}/g, "\n\n").trim();
  if (reasons.size) {
    if (filtered.replace(FENCE, "").trim()) {
      text = filtered;
      changes.push(...[...reasons].map((r) => `unsupported_${r}_removed`));
    } else {
      changes.push("unsupported_claim_kept");
    }
  }

  const issues: string[] = [];
  let blocks = 0;
  for (const m of text.matchAll(FENCE)) {
    blocks++;
    issues.push(...checkBlock(m[1] || opts.analysis?.language || "", m[2]!));
  }
  const validationStatus: CodeValidationStatus = !blocks ? "not_applicable" : issues.length ? "static_issues" : "static_ok";
  return { answer: text, changes, validationStatus, issues };
}
