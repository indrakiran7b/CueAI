import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const {
  clearQuestionMemory,
  evaluateQuestion,
  getRecentExchanges,
  rememberExchange,
} = await import("../src/services/question-detection");

const finalSystem = { who: "System", finalized: true, forceSystem: true };

describe("question detection", () => {
  beforeEach(() => clearQuestionMemory());

  for (const text of [
    "Can you hear me?",
    "Can you see my screen?",
    "Is my audio okay?",
    "Am I audible?",
    "Shall we get started?",
    "How are you doing today?",
  ]) {
    it(`ignores call logistics: "${text}"`, () => {
      const d = evaluateQuestion(text, finalSystem);
      assert.equal(d.accept, false);
      assert.equal(d.reason, "logistics");
    });
  }

  for (const text of [
    "What is the difference between a list and a tuple in Python",
    "Explain how garbage collection works in Java",
    "How are you handling state management in your React app?",
    "Can you see my screen and explain what this SQL query does?",
  ]) {
    it(`accepts interview questions: "${text}"`, () => {
      assert.equal(evaluateQuestion(text, finalSystem).accept, true);
    });
  }

  it("dedupes the same question within the window", () => {
    assert.equal(evaluateQuestion("What is polymorphism in Java?", finalSystem).accept, true);
    const again = evaluateQuestion("What is polymorphism in Java?", finalSystem);
    assert.equal(again.accept, false);
    assert.equal(again.reason, "duplicate");
  });

  it("rejects trailing fragments that are still being spoken", () => {
    assert.equal(evaluateQuestion("What is the difference between the", finalSystem).accept, false);
  });
});

describe("exchange memory", () => {
  beforeEach(() => clearQuestionMemory());

  it("keeps a bounded list and replaces a re-answered question", () => {
    for (let i = 0; i < 20; i++) rememberExchange(`Question ${i}?`, `Answer ${i}`);
    const rows = getRecentExchanges();
    assert.equal(rows.length, 12);
    assert.equal(rows[0]?.question, "Question 8?");
    rememberExchange("Question 19?", "Better answer");
    assert.equal(getRecentExchanges().length, 12);
    assert.equal(getRecentExchanges().at(-1)?.answer, "Better answer");
  });

  it("is cleared with the rest of the session memory", () => {
    rememberExchange("What is REST?", "An architectural style.");
    clearQuestionMemory();
    assert.equal(getRecentExchanges().length, 0);
  });
});
