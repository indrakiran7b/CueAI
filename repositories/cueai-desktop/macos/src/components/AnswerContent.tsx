import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { answerBlocks } from "../../../shared/answer-blocks";

export function AnswerContent({ answer }: { answer: string }) {
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <div className="cue-structured-answer">
      {answerBlocks(answer).map((block, index) =>
        block.kind === "code" ? (
          <section className="cue-code-block" key={`code-${index}`}>
            <header>
              <span>Code — {block.lang || "Code"}</span>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(block.text).then(() => {
                    setCopied(index);
                    window.setTimeout(() => setCopied(null), 1400);
                  })
                }
              >
                {copied === index ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === index ? "Copied" : "Copy Code"}
              </button>
            </header>
            <pre><code data-language={(block.lang || "code").toLowerCase()}>{block.text}</code></pre>
          </section>
        ) : (
          <p key={`prose-${index}`}>{block.text}</p>
        ),
      )}
    </div>
  );
}
