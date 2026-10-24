import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { cleanPrompt, filterWhisperSegments, isPromptEcho } = await import("../src/whisper-filter");

describe("whisper segment filter", () => {
  it("keeps confident speech verbatim", () => {
    const out = filterWhisperSegments([
      { text: " What is the difference between", avg_logprob: -0.2, no_speech_prob: 0.01, compression_ratio: 1.3 },
      { text: " a process and a thread?", avg_logprob: -0.3, no_speech_prob: 0.02, compression_ratio: 1.2 },
    ]);
    assert.deepEqual(out, { text: "What is the difference between a process and a thread?", uncertain: false });
  });

  it("drops text invented over silence", () => {
    const out = filterWhisperSegments([
      { text: "Explain closures.", avg_logprob: -0.2, no_speech_prob: 0.05, compression_ratio: 1.2 },
      { text: "Thank you for watching.", avg_logprob: -1.1, no_speech_prob: 0.9, compression_ratio: 1.1 },
    ]);
    assert.equal(out.text, "Explain closures.");
  });

  it("drops repetition loops", () => {
    const out = filterWhisperSegments([
      { text: "the the the the the the the the", avg_logprob: -0.4, no_speech_prob: 0.1, compression_ratio: 3.4 },
    ]);
    assert.equal(out.text, "");
  });

  it("flags low-confidence speech without rewriting it", () => {
    const out = filterWhisperSegments([{ text: "Kuber nettie spods", avg_logprob: -0.95, no_speech_prob: 0.1 }]);
    assert.deepEqual(out, { text: "Kuber nettie spods", uncertain: true });
  });
});

describe("whisper prompt", () => {
  it("strips control characters and bounds length", () => {
    const p = cleanPrompt(`a\u0000b\n${"x".repeat(1000)}`);
    assert.ok(!/[\u0000-\u001f]/.test(p));
    assert.ok(p.length <= 400);
  });

  it("detects Whisper echoing its prompt on near-silence", () => {
    assert.equal(isPromptEcho("Kubernetes, Docker", "Vocabulary: Kubernetes, Docker, Terraform"), true);
    assert.equal(isPromptEcho("How do pods restart?", "Vocabulary: Kubernetes, Docker"), false);
  });
});
