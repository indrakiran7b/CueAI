import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { containsCodeBlock, parseAnswerContent } from "../lib/answer-content";

export function AnswerContent({ answer }: { answer: string }) {
  const [copied, setCopied] = useState<number | null>(null);
  const blocks = parseAnswerContent(answer);
  const coding = containsCodeBlock(answer);

  async function copyCode(index: number, code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(index);
    window.setTimeout(() => setCopied((value) => (value === index ? null : value)), 1400);
  }

  if (!coding) {
    return (
      <div className="ov-answer">
        {blocks.flatMap((block) =>
          block.kind === "prose"
            ? block.text
                .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 8)
                .map((line, index) => <p key={index}>{line}</p>)
            : [],
        )}
      </div>
    );
  }

  return (
    <div className="ov-structured-answer">
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <section className="ov-code-block" key={`code-${index}`}>
            <header>
              <span>Code — {block.language}</span>
              <button type="button" onClick={() => void copyCode(index, block.text)} aria-label={`Copy ${block.language} code`}>
                {copied === index ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === index ? "Copied" : "Copy Code"}
              </button>
            </header>
            <pre>
              <code data-language={block.language.toLowerCase()}>{block.text}</code>
            </pre>
          </section>
        ) : (
          <section className="ov-answer-section" key={`prose-${index}`}>
            <h3>{block.label}</h3>
            {block.text
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
          </section>
        ),
      )}
    </div>
  );
}
