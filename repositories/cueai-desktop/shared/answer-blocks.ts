export type AnswerBlock = { kind: "text" | "code"; text: string; lang?: string };

/**
 * Splits an answer into display blocks. Fenced code keeps its exact indentation;
 * prose is split into bullet lines or sentences for easy reading while speaking.
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  const fence = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const m of text.matchAll(fence)) {
    blocks.push(...proseBlocks(text.slice(last, m.index)));
    const code = m[2]!.replace(/\s+$/, "");
    if (code.trim()) blocks.push({ kind: "code", text: code, lang: m[1]!.trim() || undefined });
    last = m.index! + m[0].length;
  }
  blocks.push(...proseBlocks(text.slice(last)));
  return blocks;
}

function proseBlocks(text: string): AnswerBlock[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.map((line) => ({ kind: "text", text: line }));
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return sentences.map((line) => ({ kind: "text", text: line }));
}
