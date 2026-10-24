/**
 * Deterministic tests for the live audio → question → answer pipeline.
 *
 * Real segmenter, transcription queue, turn detector, question gate and
 * auto-answer controller, driven by synthetic audio on a fake clock. Only the
 * providers (Whisper, LLM) are mocked; real-provider behaviour is measured
 * separately by scripts/live-pipeline-e2e.mts.
 *
 *   npm run test:pipeline
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const { LivePipeline } = await import("../src/services/live-pipeline");
const { TranscriptionQueue, TranscribeError } = await import("../src/services/transcription-queue");
const { classifyCompleteness, mergeTranscripts } = await import("../src/services/turn-detector");
const { AutoAnswerController } = await import("../src/services/auto-answer-controller");
const {
  clearQuestionMemory,
  evaluateQuestion,
  getRecentExchanges,
  rememberExchange,
} = await import("../src/services/question-detection");

type TranscribeJob = import("../src/services/transcription-queue").TranscribeJob;
type TranscribeResult = import("../src/services/transcription-queue").TranscribeResult;
type FinalUtterance = import("../src/services/turn-detector").FinalUtterance;
type LaneName = import("../src/services/live-pipeline").LaneName;
type GenerateRequest = import("../src/services/auto-answer-controller").GenerateRequest;
type ControllerEvent = import("../src/services/auto-answer-controller").ControllerEvent;

const SR = 16_000;
const CHUNK_MS = 40;
const CHUNK = (SR * CHUNK_MS) / 1000;

function tone() {
  const out = new Float32Array(CHUNK);
  for (let i = 0; i < CHUNK; i++) out[i] = 0.1 * Math.sin((2 * Math.PI * 220 * i) / SR);
  return out;
}

let seed = 7;
function hush() {
  const out = new Float32Array(CHUNK);
  for (let i = 0; i < CHUNK; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1) * 0.002;
  }
  return out;
}

const settle = () => new Promise<void>((r) => setImmediate(r));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type RigOptions = {
  script?: string[];
  transcribe?: (job: TranscribeJob, signal: AbortSignal) => Promise<TranscribeResult>;
  lanes?: LaneName[];
};

/** A pipeline on a fake clock with a scripted (mock) Whisper. */
function rig(opts: RigOptions = {}) {
  const script = [...(opts.script || [])];
  const utterances: FinalUtterance[] = [];
  const drops: { who: string; text: string; reason: string }[] = [];
  const errors: string[] = [];
  const jobs: TranscribeJob[] = [];
  let now = 0;
  const pipeline = new LivePipeline({
    partials: false,
    now: () => now,
    transcribe:
      opts.transcribe ||
      (async (job) => {
        jobs.push(job);
        return { text: script.shift() ?? "" };
      }),
    onUtterance: (u) => utterances.push(u),
    onDrop: (who, text, reason) => drops.push({ who, text, reason }),
    onTranscribeError: (_who, message) => errors.push(message),
  });
  const lanes = new Map((opts.lanes || ["System"]).map((l) => [l, pipeline.addLane(l, SR)] as const));
  async function run(lane: LaneName, ms: number, voiced: boolean) {
    for (let t = 0; t < ms; t += CHUNK_MS) {
      now += CHUNK_MS;
      lanes.get(lane)!.push(voiced ? tone() : hush(), now);
      await settle();
    }
  }
  return {
    pipeline,
    utterances,
    drops,
    errors,
    jobs,
    get now() {
      return now;
    },
    speak: (ms: number, lane: LaneName = "System") => run(lane, ms, true),
    silence: (ms: number, lane: LaneName = "System") => run(lane, ms, false),
    async idle(ms: number) {
      for (let t = 0; t < ms; t += CHUNK_MS) {
        now += CHUNK_MS;
        pipeline.tick(now);
        await settle();
      }
    },
    remove(lane: LaneName) {
      pipeline.removeLane(lane, now);
      lanes.delete(lane);
    },
  };
}

/** Controller with a mock LLM whose responses the test controls. */
function answerer(respond?: (req: GenerateRequest) => Promise<{ answer: string }>) {
  const requests: GenerateRequest[] = [];
  const events: ControllerEvent[] = [];
  const controller = new AutoAnswerController({
    generate: (req) => {
      requests.push(req);
      return respond ? respond(req) : Promise.resolve({ answer: `Answer to: ${req.question}` });
    },
    onEvent: (e) => events.push(e),
  });
  return { controller, requests, events };
}

/** The same gate App.tsx applies to a finalized interviewer turn. */
function autoSubmit(controller: InstanceType<typeof AutoAnswerController>, u: FinalUtterance) {
  const d = evaluateQuestion(u.text, {
    who: u.lane,
    allowSelfQuestions: true,
    finalized: true,
    turnFinalized: true,
    forceSystem: true,
  });
  if (!d.accept) return d;
  controller.submit({ utteranceId: u.id, text: d.question, finalizedAt: u.finalizedAt, source: "auto" });
  return d;
}

beforeEach(() => clearQuestionMemory());

describe("turn completion", () => {
  it("1. answers a short technical question ~650 ms after the last word", async () => {
    const r = rig({ script: ["What is a decorator in Python?"] });
    await r.silence(400);
    await r.speak(1200);
    await r.silence(1500);
    assert.equal(r.utterances.length, 1);
    const u = r.utterances[0]!;
    assert.equal(u.text, "What is a decorator in Python?");
    assert.equal(u.completeness, "complete");
    const wait = u.finalizedAt - u.lastVoiceAt;
    assert.ok(wait >= 650 && wait <= 700, `finalized ${wait} ms after last voice`);
  });

  it("2. keeps a long question with a mid-sentence pause as one turn", async () => {
    const r = rig({ script: ["How would you design a rate limiter", "for a public API?"] });
    await r.speak(1500);
    await r.silence(700);
    assert.equal(r.utterances.length, 0, "must not answer at the pause");
    await r.speak(1000);
    await r.silence(1500);
    assert.equal(r.utterances.length, 1);
    assert.equal(r.utterances[0]!.text, "How would you design a rate limiter for a public API?");
    assert.equal(r.utterances[0]!.segments, 2);
  });

  it("3. sends recent words as Whisper context so terminology stays consistent", async () => {
    const r = rig({ script: ["What is a Kubernetes pod?", "How does a StatefulSet differ from a Deployment?"] });
    await r.speak(1200);
    await r.silence(1500);
    await r.speak(1500);
    await r.silence(1500);
    assert.equal(r.utterances.length, 2);
    assert.equal(r.jobs[0]!.prompt, "");
    assert.match(r.jobs[1]!.prompt || "", /Kubernetes pod/);
  });

  it("4. separates two consecutive questions", async () => {
    const r = rig({ script: ["What is a Python list?", "When would you use a tuple instead?"] });
    await r.speak(1200);
    await r.silence(900);
    await r.speak(1400);
    await r.silence(1500);
    assert.deepEqual(
      r.utterances.map((u) => u.text),
      ["What is a Python list?", "When would you use a tuple instead?"],
    );
  });

  it("6. waits through a long pause before the final words", async () => {
    const r = rig({ script: ["What is the difference between", "a process and a thread?"] });
    await r.speak(1500);
    await r.silence(2600);
    assert.equal(r.utterances.length, 0, "an unfinished fragment is never answered");
    await r.speak(1200);
    await r.silence(1500);
    assert.equal(r.utterances.length, 1);
    assert.equal(r.utterances[0]!.text, "What is the difference between a process and a thread?");
  });

  it("16. never answers an incomplete transcript, and reports it when it expires", async () => {
    const r = rig({ script: ["Can you explain the difference between"] });
    await r.speak(1500);
    await r.silence(3000);
    await r.idle(9000);
    assert.equal(r.utterances.length, 0);
    assert.deepEqual(r.drops.map((d) => d.reason), ["incomplete_expired"]);
  });

  it("classifies completeness from the tail word, not Whisper punctuation", () => {
    assert.equal(classifyCompleteness("What is the difference between?"), "incomplete");
    assert.equal(classifyCompleteness("Explain how garbage collection works."), "complete");
    assert.equal(classifyCompleteness("When you design a cache,"), "incomplete");
    assert.equal(classifyCompleteness("Which tools are you comfortable with"), "soft");
    assert.equal(classifyCompleteness("What is a closure?"), "complete");
  });

  it("removes words duplicated by overlapping audio", () => {
    assert.equal(
      mergeTranscripts("Walk me through how you would migrate the", "how you would migrate the database schema"),
      "Walk me through how you would migrate the database schema",
    );
    assert.equal(mergeTranscripts("How would you design it?", "for millions of users"), "How would you design it, for millions of users");
  });
});

describe("transcription queue", () => {
  it("7. releases out-of-order transcription responses in spoken order", async () => {
    const pending = [deferred<TranscribeResult>(), deferred<TranscribeResult>()];
    let call = 0;
    const order: number[] = [];
    const q = new TranscriptionQueue({
      transcribe: () => pending[call++]!.promise,
      onResult: (job) => order.push(job.segmentId),
      onError: () => assert.fail("no error expected"),
    });
    const wav = new Blob([new Uint8Array(4000)]);
    q.enqueue({ lane: "System", segmentId: 1, kind: "final", wav });
    q.enqueue({ lane: "System", segmentId: 2, kind: "final", wav });
    pending[1]!.resolve({ text: "second" });
    await settle();
    assert.deepEqual(order, [], "segment 2 must wait for segment 1");
    pending[0]!.resolve({ text: "first" });
    await settle();
    assert.deepEqual(order, [1, 2]);
  });

  it("7b. joins out-of-order segments of one question in spoken order", async () => {
    const pending = [deferred<TranscribeResult>(), deferred<TranscribeResult>()];
    let call = 0;
    const r = rig({ transcribe: () => pending[call++]!.promise });
    await r.speak(1500);
    await r.silence(600);
    await r.speak(1000);
    await r.silence(500);
    pending[1]!.resolve({ text: "for a public API?" });
    await r.silence(300);
    assert.equal(r.utterances.length, 0, "must wait for the earlier segment");
    pending[0]!.resolve({ text: "How would you design a rate limiter" });
    await r.silence(1200);
    assert.equal(r.utterances.length, 1);
    assert.equal(r.utterances[0]!.text, "How would you design a rate limiter for a public API?");
  });

  it("8. times out a hung request, retries once, then reports a 408", async () => {
    let attempts = 0;
    const failures: { status: number; attempts: number }[] = [];
    const q = new TranscriptionQueue({
      timeoutMs: 30,
      sleep: async () => undefined,
      transcribe: (_job, signal) =>
        new Promise((_, reject) => {
          attempts += 1;
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      onResult: () => assert.fail("should not succeed"),
      onError: (_job, err, timing) => failures.push({ status: (err as InstanceType<typeof TranscribeError>).status, attempts: timing.attempts }),
    });
    q.enqueue({ lane: "System", segmentId: 1, kind: "final", wav: new Blob([new Uint8Array(4000)]) });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(attempts, 2);
    assert.deepEqual(failures, [{ status: 408, attempts: 2 }]);
  });

  it("8b. a failed segment does not block the next question", async () => {
    let call = 0;
    const r = rig({
      transcribe: async () => {
        call += 1;
        if (call === 1) throw new TranscribeError("bad audio", 400);
        return { text: "What is dependency injection?" };
      },
    });
    await r.speak(1200);
    await r.silence(1500);
    assert.equal(r.utterances.length, 0);
    assert.equal(r.errors.length, 1);
    await r.speak(1200);
    await r.silence(1500);
    assert.deepEqual(r.utterances.map((u) => u.text), ["What is dependency injection?"]);
  });

  it("does not retry non-retryable errors", async () => {
    let attempts = 0;
    const q = new TranscriptionQueue({
      sleep: async () => undefined,
      transcribe: async () => {
        attempts += 1;
        throw new TranscribeError("unauthorized", 401);
      },
      onResult: () => undefined,
      onError: () => undefined,
    });
    q.enqueue({ lane: "System", segmentId: 1, kind: "final", wav: new Blob([new Uint8Array(4000)]) });
    await settle();
    await settle();
    assert.equal(attempts, 1);
  });
});

describe("auto-answer controller", () => {
  it("17. a complete transcript triggers an answer with no click", async () => {
    const r = rig({ script: ["Explain how garbage collection works in Java."] });
    const a = answerer();
    await r.speak(1500);
    await r.silence(1500);
    for (const u of r.utterances) autoSubmit(a.controller, u);
    await settle();
    assert.equal(a.requests.length, 1);
    assert.equal(a.requests[0]!.question, "Explain how garbage collection works in Java.");
    assert.equal(a.controller.snapshot.state, "answer_ready");
  });

  it("9. recovers after an LLM failure and answers the next question", async () => {
    let n = 0;
    const a = answerer(async (req) => {
      n += 1;
      if (n === 1) throw new Error("upstream timeout");
      return { answer: `Answer to: ${req.question}` };
    });
    a.controller.setListening(true);
    a.controller.submit({ utteranceId: "s-1", text: "What is a REST API?", finalizedAt: 0, source: "auto" });
    await settle();
    assert.equal(a.controller.snapshot.state, "error_recovery");
    assert.equal(a.controller.snapshot.listening, true, "listening is never paused");
    a.controller.submit({ utteranceId: "s-2", text: "What is GraphQL?", finalizedAt: 9000, source: "auto" });
    await settle();
    assert.equal(a.controller.snapshot.state, "answer_ready");
    assert.equal(a.controller.snapshot.answer, "Answer to: What is GraphQL?");
  });

  it("10. ignores a duplicate finalization event and a repeated question", async () => {
    const a = answerer();
    const first = a.controller.submit({ utteranceId: "s-1", text: "What is a closure?", finalizedAt: 0, source: "auto" });
    const again = a.controller.submit({ utteranceId: "s-1", text: "What is a closure?", finalizedAt: 0, source: "auto" });
    await settle();
    const repeat = a.controller.submit({ utteranceId: "s-2", text: "What is a closure?", finalizedAt: 5000, source: "auto" });
    assert.equal(first.accepted, true);
    assert.equal(again.reason, "duplicate_event");
    assert.equal(repeat.reason, "duplicate_question");
    assert.equal(a.requests.length, 1);
  });

  it("11. a new question supersedes an answer that is already streaming", async () => {
    const slow = deferred<{ answer: string }>();
    let n = 0;
    const a = answerer((req) => {
      n += 1;
      if (n === 1) {
        req.onToken("Partial answer about Kafka");
        return slow.promise;
      }
      return Promise.resolve({ answer: "RabbitMQ answer" });
    });
    a.controller.submit({ utteranceId: "s-1", text: "How does Kafka work?", finalizedAt: 0, source: "auto" });
    a.controller.submit({ utteranceId: "s-2", text: "How is RabbitMQ different?", finalizedAt: 9000, source: "auto" });
    await settle();
    assert.equal(a.requests[0]!.signal.aborted, true);
    assert.equal(a.requests[1]!.question, "How is RabbitMQ different?", "not merged once tokens were shown");
    slow.resolve({ answer: "stale Kafka answer" });
    await settle();
    assert.equal(a.controller.snapshot.answer, "RabbitMQ answer", "a stale answer never overwrites a newer one");
  });

  it("4b. merges a second question that arrives before the first answer starts", async () => {
    const never = deferred<{ answer: string }>();
    let n = 0;
    const a = answerer((req) => (++n === 1 ? never.promise : Promise.resolve({ answer: `A: ${req.question}` })));
    a.controller.submit({ utteranceId: "s-1", text: "What is REST?", finalizedAt: 0, source: "auto" });
    a.controller.submit({ utteranceId: "s-2", text: "And how is GraphQL different?", finalizedAt: 1500, source: "auto" });
    await settle();
    assert.equal(a.requests[1]!.question, "What is REST? And how is GraphQL different?");
    assert.equal(a.controller.snapshot.answer, "A: What is REST? And how is GraphQL different?");
  });

  it("re-answers the whole question when the interviewer continues after an answer", async () => {
    const a = answerer();
    a.controller.submit({ utteranceId: "s-1", text: "What are Kubernetes pods and deployments?", finalizedAt: 0, source: "auto" });
    await settle();
    a.controller.submit({ utteranceId: "s-2", text: "And how do they relate?", finalizedAt: 2100, source: "auto" });
    await settle();
    assert.equal(a.requests[1]!.question, "What are Kubernetes pods and deployments? And how do they relate?");
    a.controller.submit({ utteranceId: "s-3", text: "And what is a Service?", finalizedAt: 30_000, source: "auto" });
    await settle();
    assert.equal(a.requests[2]!.question, "And what is a Service?", "outside the window it is a new question");
  });

  it("15. keeps answering after the first answer", async () => {
    const r = rig({
      script: ["What is a hash map?", "How does Python manage memory?", "What is a race condition?"],
    });
    const a = answerer();
    a.controller.setListening(true);
    for (let i = 0; i < 3; i++) {
      await r.speak(1300);
      await r.silence(1500);
      for (const u of r.utterances.splice(0)) autoSubmit(a.controller, u);
      await settle();
    }
    assert.equal(a.requests.length, 3);
    assert.equal(a.events.filter((e) => e.type === "complete").length, 3);
    assert.equal(a.controller.snapshot.listening, true);
  });
});

describe("conversation context", () => {
  it("5/18. accepts short follow-ups only after an earlier answer", () => {
    const opts = { who: "System", finalized: true, turnFinalized: true, forceSystem: true };
    assert.equal(evaluateQuestion("Why?", opts).reason, "too_short");
    rememberExchange("Which database did you choose for the project?", "PostgreSQL, for transactions.");
    assert.equal(evaluateQuestion("Why?", opts).accept, true);
    assert.equal(evaluateQuestion("Why did you choose that?", opts).accept, true);
    assert.deepEqual(getRecentExchanges().at(-1), {
      question: "Which database did you choose for the project?",
      answer: "PostgreSQL, for transactions.",
    });
  });

  it("20. filler-only or garbled speech does not produce an answer", () => {
    const opts = { who: "System", finalized: true, turnFinalized: true, forceSystem: true };
    for (const text of ["Um, so, okay, yeah.", "Uh, you know, like, um", "Hmm. Right. Okay."]) {
      assert.equal(evaluateQuestion(text, opts).reason, "filler", text);
    }
  });

  it("never auto-answers the candidate's own microphone", async () => {
    const r = rig({ lanes: ["You"], script: ["What is a decorator in Python?"] });
    await r.speak(1200, "You");
    await r.silence(1500, "You");
    assert.equal(r.utterances.length, 1);
    assert.equal(r.utterances[0]!.lane, "You", "App.tsx skips lane You before the gate");
  });
});

describe("capture lifecycle", () => {
  it("12. a microphone that stops mid-sentence still delivers its speech", async () => {
    const r = rig({ lanes: ["You", "System"], script: ["I would start with the indexes."] });
    await r.speak(1200, "You");
    r.remove("You");
    await r.idle(1500);
    assert.deepEqual(r.utterances.map((u) => [u.lane, u.text]), [["You", "I would start with the indexes."]]);
  });

  it("13. system audio failing does not stop microphone capture", async () => {
    const r = rig({ lanes: ["You", "System"], script: ["How do you handle flaky tests?"] });
    r.remove("System");
    await r.speak(1300, "You");
    await r.silence(1500, "You");
    assert.deepEqual(r.utterances.map((u) => u.text), ["How do you handle flaky tests?"]);
  });

  it("14. several sessions in a row start clean and ignore late results", async () => {
    const late = deferred<TranscribeResult>();
    let call = 0;
    const texts = ["What is Docker?", "What is Terraform?", "What is Ansible?"];
    const r = rig({
      transcribe: () => (call++ === 0 ? late.promise : Promise.resolve({ text: texts.shift()! })),
    });
    const a = answerer();
    // Session 1 ends while its transcript is still in flight.
    await r.speak(1200);
    await r.silence(600);
    r.pipeline.reset();
    a.controller.reset();
    late.resolve({ text: "What is Kubernetes?" });
    await r.idle(1500);
    assert.equal(r.utterances.length, 0, "a result from an ended session is dropped");
    for (let s = 0; s < 3; s++) {
      await r.speak(1200);
      await r.silence(1500);
      for (const u of r.utterances.splice(0)) autoSubmit(a.controller, u);
      await settle();
      assert.equal(a.controller.snapshot.state, "answer_ready", `session ${s + 2}`);
      r.pipeline.reset();
      a.controller.reset();
      clearQuestionMemory();
    }
    assert.deepEqual(
      a.requests.map((q) => q.question),
      ["What is Docker?", "What is Terraform?", "What is Ansible?"],
    );
  });
});
