export type AnswerContentBlock =
  | { kind: "prose"; text: string; label: "Approach" | "Explanation" | "Complexity" }
  | { kind: "code"; text: string; language: string };

const LANGUAGE_LABELS: Record<string, string> = {
  py: "Python",
  python: "Python",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  java: "Java",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  cs: "C#",
  csharp: "C#",
  "c#": "C#",
  sql: "SQL",
  abap: "ABAP",
  ruby: "Ruby",
  rb: "Ruby",
  go: "Go",
  rust: "Rust",
  php: "PHP",
  kotlin: "Kotlin",
  swift: "Swift",
  shell: "Shell",
  bash: "Bash",
};

function languageLabel(raw: string) {
  const key = raw.trim().toLowerCase().replace(/[^\w#+-]/g, "");
  return LANGUAGE_LABELS[key] || (raw.trim() ? raw.trim() : "Code");
}

function cleanProse(raw: string) {
  return raw
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\*\*(.+?)\*\*\s*:?\s*$/gm, "$1")
    .trim();
}

function proseLabel(text: string, afterCode: boolean): "Approach" | "Explanation" | "Complexity" {
  if (/\b(time|space)\s+complexity\b|\bO\([^)]+\)/i.test(text)) return "Complexity";
  return afterCode ? "Explanation" : "Approach";
}

/** Parse fenced code without touching its internal whitespace or indentation. */
export function parseAnswerContent(answer: string): AnswerContentBlock[] {
  const blocks: AnswerContentBlock[] = [];
  const fence = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let cursor = 0;
  let sawCode = false;
  for (let match = fence.exec(answer); match; match = fence.exec(answer)) {
    const prose = cleanProse(answer.slice(cursor, match.index));
    if (prose) blocks.push({ kind: "prose", text: prose, label: proseLabel(prose, sawCode) });
    blocks.push({
      kind: "code",
      language: languageLabel(match[1] || ""),
      text: (match[2] || "").replace(/\r\n/g, "\n").replace(/\n$/, ""),
    });
    sawCode = true;
    cursor = match.index + match[0].length;
  }
  const rest = cleanProse(answer.slice(cursor));
  if (rest) blocks.push({ kind: "prose", text: rest, label: proseLabel(rest, sawCode) });
  if (!blocks.length && answer.trim()) {
    blocks.push({ kind: "prose", text: cleanProse(answer), label: "Explanation" });
  }
  return blocks;
}

export function containsCodeBlock(answer: string) {
  return /```[^\r\n`]*\r?\n[\s\S]*?```/.test(answer);
}
