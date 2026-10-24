import { cn } from "@/lib/utils";

/** Splits an answer into prose and fenced code; an unclosed fence (mid-stream) runs to the end. */
export function answerSegments(text: string): { kind: "text" | "code"; body: string; lang?: string }[] {
  const out: { kind: "text" | "code"; body: string; lang?: string }[] = [];
  const re = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: "text", body: text.slice(last, m.index) });
    out.push({ kind: "code", lang: m[1]!.trim() || undefined, body: m[2]!.replace(/\n$/, "") });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", body: text.slice(last) });
  return out.filter((s) => s.body.trim());
}

/** Renders an AI answer: prose keeps line breaks, code blocks keep indentation. */
export function AnswerText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {answerSegments(text).map((seg, i) =>
        seg.kind === "code" ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-md border border-border bg-foreground/5 p-3 font-mono text-xs leading-relaxed"
            aria-label={seg.lang ? `${seg.lang} code` : "code"}
          >
            <code>{seg.body}</code>
          </pre>
        ) : (
          <p key={i} className="whitespace-pre-wrap break-words">
            {seg.body.trim()}
          </p>
        ),
      )}
    </div>
  );
}
