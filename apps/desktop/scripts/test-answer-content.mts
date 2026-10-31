import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { containsCodeBlock, parseAnswerContent } from "../src/lib/answer-content";

describe("coding answer presentation", () => {
  const answer = `Use the Sieve of Eratosthenes.

\`\`\`python
def primes(limit: int) -> list[int]:
    sieve = [True] * (limit + 1)
    for value in range(2, int(limit ** 0.5) + 1):
        if sieve[value]:
            for multiple in range(value * value, limit + 1, value):
                sieve[multiple] = False
    return [value for value in range(2, limit + 1) if sieve[value]]
\`\`\`

The nested marking work is O(n log log n), with O(n) space complexity.`;

  it("keeps fenced code separate with exact indentation and a language label", () => {
    const blocks = parseAnswerContent(answer);
    assert.equal(containsCodeBlock(answer), true);
    assert.equal(blocks.length, 3);
    assert.deepEqual(blocks.map((b) => b.kind), ["prose", "code", "prose"]);
    const code = blocks[1]!;
    assert.equal(code.kind, "code");
    if (code.kind !== "code") return;
    assert.equal(code.language, "Python");
    assert.match(code.text, /\n    sieve =/);
    assert.match(code.text, /\n            for multiple/);
    assert.doesNotMatch(code.text, /```/);
  });

  it("does not put normal technical answers into a code box", () => {
    const blocks = parseAnswerContent("REST is resource-oriented. SOAP uses a formal XML envelope.");
    assert.equal(containsCodeBlock("REST is resource-oriented."), false);
    assert.ok(blocks.every((block) => block.kind === "prose"));
  });

  it("keeps all five required coding scenarios structured and complete", () => {
    const cases = [
      ["prime numbers", "python", "Python", "def primes(limit):\n    return [n for n in range(2, limit + 1)]"],
      ["reverse a string", "python", "Python", "def reverse(value):\n    return value[::-1]"],
      ["duplicate array elements", "python", "Python", "def duplicates(values):\n    return {x for x in values if values.count(x) > 1}"],
      ["second-highest salary", "sql", "SQL", "SELECT MAX(salary)\nFROM employees\nWHERE salary < (SELECT MAX(salary) FROM employees);"],
      ["merge intervals", "python", "Python", "def merge(intervals):\n    intervals.sort()\n    return intervals"],
    ] as const;
    for (const [name, fence, label, code] of cases) {
      const blocks = parseAnswerContent(`Approach\nUse the direct solution.\n\n\`\`\`${fence}\n${code}\n\`\`\`\n\nComplexity\nState the cost.`);
      const codeBlock = blocks.find((block) => block.kind === "code");
      assert.ok(codeBlock && codeBlock.kind === "code", `${name}: dedicated code block`);
      assert.equal(codeBlock.language, label, `${name}: language label`);
      assert.equal(codeBlock.text, code, `${name}: exact newlines and indentation`);
    }
  });

  it("renders a per-code copy action through the clipboard API", () => {
    const component = readFileSync(new URL("../src/components/AnswerContent.tsx", import.meta.url), "utf8");
    assert.match(component, /Copy Code/);
    assert.match(component, /navigator\.clipboard\.writeText\(code\)/);
  });
});
