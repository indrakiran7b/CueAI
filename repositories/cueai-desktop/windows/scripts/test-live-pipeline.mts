/**
 * Deterministic tests for the live listening → question → answer pipeline.
 * Audio, transcription and the LLM are simulated with a fake clock; nothing here
 * proves real-device capture or real-provider latency.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AnswerSequencer,
  PipelineMetrics,
  QuestionGate,
  UtteranceAssembler,
  isLikelyComplete,
  mergeOverlap,
  selectHistory,
  type Clock,
  type FinalUtterance,
} from "../../shared/live-pipeline.ts";
import { answerBlocks } from "../../shared/answer-blocks.ts";

class FakeClock implements Clock {
  t = 0;
  private timers: { id: number; at: number; fn: () => void }[] = [];
  private nextId = 1;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ id, at: this.t + ms, fn });
    return id;
  }
  clearTimeout(id: unknown) {
    this.timers = this.timers.filter((x) => x.id !== id);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}

function rig() {
  const clock = new FakeClock();
  const finals: FinalUtterance[] = [];
  const asm = new UtteranceAssembler({ clock, onFinal: (u) => finals.push(u) });
  const gate = new QuestionGate({ clock });
  let seq = 0;
  /** One VAD speech run: talk, stop, transcription returns after `sttMs`. */
  function say(who: string, text: string | null, opts: { talkMs?: number; sttMs?: number } = {}) {
    asm.speechStart(who);
    clock.advance(opts.talkMs ?? 1500);
    const s = ++seq;
    asm.segmentQueued(who, s);
    asm.speechEnd(who);
    clock.advance(opts.sttMs ?? 400);
    asm.segmentResult(who, s, text === null ? null : { text, transcribedAt: clock.now() });
    return s;
  }
  return { clock, finals, asm, gate, say, nextSeq: () => ++seq };
}

test("1/17: a short technical question finalizes and is accepted with no click", () => {
  const { clock, finals, gate, say } = rig();
  say("System", "What is a Python decorator?");
  assert.equal(finals.length, 0, "waits for the short stabilization window");
  clock.advance(150);
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.complete, true);
  const d = gate.evaluate(finals[0]!, { answerable: true });
  assert.equal(d.accept, true);
});

test("2: a long question with a pause in the middle becomes one utterance", () => {
  const { clock, finals, asm, say, nextSeq } = rig();
  say("System", "Can you explain the difference between");
  // Interviewer resumes 700ms later, before the incomplete hold expires.
  clock.advance(300);
  asm.speechStart("System");
  clock.advance(1200);
  const s = nextSeq();
  asm.segmentQueued("System", s);
  asm.speechEnd("System");
  clock.advance(400);
  asm.segmentResult("System", s, { text: "lists and tuples in Python?" });
  clock.advance(200);
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.text, "Can you explain the difference between lists and tuples in Python?");
  assert.equal(finals[0]!.complete, true);
});

test("3: technical terms survive merging and uncertainty is reported, not rewritten", () => {
  const { clock, finals, asm, nextSeq } = rig();
  asm.speechStart("System");
  clock.advance(5000);
  const a = nextSeq();
  asm.segmentQueued("System", a);
  clock.advance(2000);
  const b = nextSeq();
  asm.segmentQueued("System", b);
  asm.speechEnd("System");
  asm.segmentResult("System", a, { text: "How do you deploy a C++ service on Kubernetes" });
  asm.segmentResult("System", b, { text: "Kubernetes with Helm and CI/CD?", uncertain: true });
  clock.advance(200);
  assert.equal(finals[0]!.text, "How do you deploy a C++ service on Kubernetes with Helm and CI/CD?");
  assert.equal(finals[0]!.uncertain, true);
});

test("4/15: two consecutive questions each produce an answer, and answering keeps working", () => {
  const { clock, finals, gate, say } = rig();
  const seqr = new AnswerSequencer();
  say("System", "What is a REST API?");
  clock.advance(2000);
  say("System", "How is it different from GraphQL?");
  clock.advance(2000);
  say("System", "When would you pick gRPC instead?");
  clock.advance(500);
  assert.equal(finals.length, 3);
  const accepted = finals.filter((u) => gate.evaluate(u, { answerable: true }).accept);
  assert.equal(accepted.length, 3);
  const tickets = accepted.map((u) => seqr.begin(u.id));
  assert.ok(tickets.every(Boolean));
  assert.equal(seqr.isCurrent(tickets[2]!.id), true);
});

test("5/18: follow-ups that depend on the previous answer are accepted and get history", () => {
  const { clock, finals, gate, say } = rig();
  say("System", "Which test framework did you use in your last project?");
  clock.advance(1500);
  say("System", "Why did you choose that?");
  clock.advance(200);
  say("System", "Why?");
  clock.advance(200);
  const decisions = finals.map((u) => gate.evaluate(u, { answerable: true }));
  assert.deepEqual(decisions.map((d) => d.accept), [true, true, true]);
  assert.equal(decisions[2]!.followUp, true);
  const history = selectHistory("Why?", [
    { question: "Which test framework did you use in your last project?", answer: "I used pytest." },
  ]);
  assert.equal(history.length, 1, "the previous exchange travels with the follow-up");
});

test("6: a long pause before the final words still joins the question", () => {
  const { clock, finals, say } = rig();
  say("System", "What would you use to");
  clock.advance(1100);
  assert.equal(finals.length, 0, "incomplete wording holds instead of finalizing");
  say("System", "test a REST API?", { talkMs: 900 });
  clock.advance(200);
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.text, "What would you use to test a REST API?");
});

test("7: transcriptions returning out of order are re-ordered", () => {
  const { clock, finals, asm, nextSeq } = rig();
  asm.speechStart("System");
  clock.advance(4500);
  const a = nextSeq();
  asm.segmentQueued("System", a);
  clock.advance(3000);
  const b = nextSeq();
  asm.segmentQueued("System", b);
  asm.speechEnd("System");
  asm.segmentResult("System", b, { text: "and how do you avoid memory leaks?" });
  clock.advance(300);
  assert.equal(finals.length, 0, "a later segment cannot finalize ahead of an earlier one");
  asm.segmentResult("System", a, { text: "How does garbage collection work in Java" });
  clock.advance(200);
  assert.equal(finals[0]!.text, "How does garbage collection work in Java and how do you avoid memory leaks?");
});

test("8: a transcription that times out is skipped instead of blocking the question", () => {
  const { clock, finals, asm, nextSeq } = rig();
  asm.speechStart("System");
  clock.advance(4500);
  const lost = nextSeq();
  asm.segmentQueued("System", lost);
  clock.advance(1500);
  const ok = nextSeq();
  asm.segmentQueued("System", ok);
  asm.speechEnd("System");
  asm.segmentResult("System", ok, { text: "What is dependency injection?" });
  clock.advance(5000);
  assert.equal(finals.length, 0);
  clock.advance(15_000);
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.text, "What is dependency injection?");
});

test("9: a failed answer does not disable later auto-answers", () => {
  const seqr = new AnswerSequencer();
  const metrics = new PipelineMetrics(new FakeClock());
  const first = seqr.begin("System-1")!;
  metrics.count("answerFailed");
  seqr.finish(first.id);
  const second = seqr.begin("System-2");
  assert.ok(second, "a new question still gets a ticket");
  assert.equal(seqr.isCurrent(second!.id), true);
});

test("10: a duplicate finalization never answers twice", () => {
  const { clock, finals, gate, say } = rig();
  const seqr = new AnswerSequencer();
  say("System", "What is a closure in JavaScript?");
  clock.advance(200);
  const u = finals[0]!;
  assert.ok(seqr.begin(u.id));
  assert.equal(seqr.begin(u.id), null, "same utterance id is rejected");
  assert.equal(gate.evaluate(u, { answerable: true }).accept, true);
  assert.equal(gate.evaluate(u, { answerable: true }).reason, "duplicate");
  // A re-transcription of the same words moments later is also a duplicate.
  assert.equal(
    gate.evaluate({ text: "What is a closure in JavaScript", complete: true }, { answerable: true }).reason,
    "duplicate",
  );
});

test("10b: a longer new question that contains an earlier one is not a duplicate", () => {
  const gate = new QuestionGate({ clock: new FakeClock() });
  assert.equal(gate.evaluate({ text: "What is Python?", complete: true }, { answerable: true }).accept, true);
  assert.equal(
    gate.evaluate({ text: "What is Python used for in test automation?", complete: true }, { answerable: true })
      .accept,
    true,
  );
});

test("11: a new question supersedes an answer that is still generating", () => {
  const seqr = new AnswerSequencer();
  const older = seqr.begin("System-1")!;
  const newer = seqr.begin("System-2")!;
  assert.equal(older.signal.aborted, true, "the stale request is cancelled");
  assert.equal(seqr.isCurrent(older.id), false, "a late token from the old answer is ignored");
  assert.equal(seqr.isCurrent(newer.id), true);
});

test("12: mic capture stopping mid-speech still finalizes what was heard", () => {
  const { clock, finals, asm, nextSeq } = rig();
  asm.speechStart("You");
  clock.advance(2000);
  const s = nextSeq();
  asm.segmentQueued("You", s);
  asm.laneStopped("You");
  asm.segmentResult("You", s, { text: "What is a deadlock?" });
  clock.advance(200);
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.who, "You");
});

test("13: system audio failing does not disturb the microphone lane", () => {
  const { clock, finals, asm, say, nextSeq } = rig();
  asm.speechStart("System");
  const lost = nextSeq();
  asm.segmentQueued("System", lost);
  asm.laneStopped("System");
  say("You", "How do I reverse a linked list?");
  clock.advance(200);
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.who, "You");
  asm.segmentResult("System", lost, null);
  clock.advance(5000);
  assert.equal(finals.length, 1, "the failed system segment yields nothing");
});

test("14: consecutive live sessions start clean", () => {
  const { clock, finals, asm, gate, say } = rig();
  const seqr = new AnswerSequencer();
  say("System", "What is the difference between");
  clock.advance(2000);
  assert.equal(finals[0]!.complete, false);
  gate.evaluate({ text: "What is polymorphism?", complete: true }, { answerable: true });
  for (let i = 0; i < 3; i++) {
    asm.reset();
    gate.reset();
    seqr.reset();
  }
  say("System", "What is polymorphism?");
  clock.advance(200);
  assert.equal(finals.length, 2);
  assert.equal(finals[1]!.text, "What is polymorphism?", "no carry-over from the previous session");
  assert.equal(gate.evaluate(finals[1]!, { answerable: true }).accept, true);
  assert.ok(seqr.begin(finals[1]!.id));
});

test("16: an incomplete transcript does not trigger a premature answer, then completes", () => {
  const { clock, finals, gate, say } = rig();
  say("System", "What is the difference between");
  clock.advance(2000);
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.complete, false);
  assert.equal(gate.evaluate(finals[0]!, { answerable: true }).reason, "incomplete");
  say("System", "an abstract class and an interface?");
  clock.advance(200);
  assert.equal(finals[1]!.text, "What is the difference between an abstract class and an interface?");
  assert.equal(finals[1]!.carried, true);
  assert.equal(gate.evaluate(finals[1]!, { answerable: true }).accept, true);
});

test("19: project questions keep verified-context selection small and relevant", () => {
  const history = selectHistory("What did you use for the payments project database?", [
    { question: "Tell me about the payments project", answer: "I built the payments API with FastAPI." },
    { question: "What is a closure?", answer: "A function with captured scope." },
    { question: "What is REST?", answer: "An architectural style." },
    { question: "What is gRPC?", answer: "An RPC framework." },
    { question: "What is Kafka?", answer: "A log-based broker." },
  ]);
  assert.equal(history[0]!.question, "Tell me about the payments project", "older relevant turn kept");
  assert.ok(!history.some((h) => h.question === "What is a closure?"), "irrelevant older turn dropped");
  assert.ok(history.length <= 6);
});

test("20: ambiguous or filler speech is not answered", () => {
  const gate = new QuestionGate({ clock: new FakeClock() });
  assert.equal(gate.evaluate({ text: "Okay.", complete: true }, { answerable: true }).reason, "filler");
  assert.equal(
    gate.evaluate({ text: "Thanks for joining today everyone.", complete: true }, { answerable: true }).reason,
    "not_question",
  );
  assert.equal(gate.evaluate({ text: "Why?", complete: true }, { answerable: true }).reason, "too_short",
    "a bare 'why' with no prior exchange has nothing to refer to");
});

test("candidate's own mic speech is not answered while the interviewer lane is active", () => {
  const gate = new QuestionGate({ clock: new FakeClock() });
  assert.equal(
    gate.evaluate({ text: "What is a deadlock?", complete: true }, { answerable: false }).reason,
    "speaker_not_answered",
  );
});

test("completion heuristics", () => {
  assert.equal(isLikelyComplete("What is a closure?", "strict"), true);
  assert.equal(isLikelyComplete("Explain polymorphism.", "strict"), true);
  assert.equal(isLikelyComplete("Do you know what a closure is?", "strict"), true);
  assert.equal(isLikelyComplete("What is the difference between", "strict"), false);
  assert.equal(isLikelyComplete("What is the difference between?", "lenient"), false);
  assert.equal(isLikelyComplete("What is a decorator in Python", "strict"), false);
  assert.equal(isLikelyComplete("What is a decorator in Python", "lenient"), true);
  assert.equal(isLikelyComplete("Can you explain", "lenient"), false);
});

test("overlap merge removes duplicated boundary words only", () => {
  assert.equal(mergeOverlap("tell me about", "about your project"), "tell me about your project");
  assert.equal(mergeOverlap("deploy on Kubernetes", "Kubernetes clusters"), "deploy on Kubernetes clusters");
  assert.equal(mergeOverlap("is it a", "a list"), "is it a a list", "short function words are not merged");
});

test("metrics compute per-stage latency from monotonic marks", () => {
  const clock = new FakeClock();
  const m = new PipelineMetrics(clock);
  m.mark("u1", "lastVoice", 1000);
  m.mark("u1", "speechEnd", 1450);
  m.mark("u1", "transcriptResponse", 1900);
  m.mark("u1", "finalized", 2020);
  m.mark("u1", "firstToken", 2600);
  m.mark("u1", "answerComplete", 4000);
  assert.deepEqual(m.summarize("u1"), {
    audioToTranscriptMs: 450,
    finalWordToFinalizedMs: 1020,
    finalizedToFirstTokenMs: 580,
    finalizedToCompleteMs: 1980,
    endToEndMs: 1600,
  });
});

test("answer blocks keep code indentation and do not truncate prose", () => {
  const answer = [
    "I check divisors up to the square root.",
    "```python",
    "n = int(input())",
    "if n < 2:",
    "    print(\"not prime\")",
    "else:",
    "    print(\"check\")",
    "```",
    "One. Two. Three. Four. Five. Six. Seven.",
  ].join("\n");
  const blocks = answerBlocks(answer);
  const code = blocks.find((b) => b.kind === "code");
  assert.equal(code?.lang, "python");
  assert.equal(code?.text, 'n = int(input())\nif n < 2:\n    print("not prime")\nelse:\n    print("check")');
  assert.equal(blocks.filter((b) => b.kind === "text").length, 8);
  const streaming = answerBlocks("```python\ndef f():\n    return 1");
  assert.deepEqual(streaming, [{ kind: "code", text: "def f():\n    return 1", lang: "python" }]);
});
