import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

process.env.OPENAI_API_KEY = "test-openai";
process.env.GROQ_API_KEY = "test-groq";
process.env.GROQ_STREAM_MODEL = "openai/gpt-oss-20b";

const { analyzeQuestion, describeAnalysis, detectAsrHints } = await import("../src/lib/live-question");
const { buildSystemInstruction, buildUserPrompt, formatConversationMemory, INTERVIEW_SYSTEM_PROMPT } =
  await import("../src/lib/live-answer");
const { streamLiveAnswer, LiveAnswerStreamError } = await import("../src/lib/server/live-answer-providers");
const { resetOpenAiCooldown, openAiAvailable } = await import("../src/lib/server/openai");

describe("question analysis", () => {
  const cases: [string, string][] = [
    ["What is a decorator in Python?", "definition"],
    ["What is the difference between implicit wait and explicit wait in Selenium?", "comparison"],
    ["Write a Python function to reverse a singly linked list.", "coding"],
    ["How would you debug a flaky Selenium test that passes locally but fails in CI?", "debugging"],
    ["Tell me about yourself.", "introduction"],
    ["Tell me about a time you disagreed with your manager.", "behavioral"],
    ["Can you explain how you have used decorators in your project?", "project"],
    ["Have you worked with Kubernetes?", "experience"],
    ["Why is Python dynamically typed?", "why"],
    ["How do you handle exceptions in Java?", "how_to"],
    ["Suppose the login API starts returning 500s in production, what would you do", "scenario"],
    ["Is Python compiled or interpreted", "yes_no"],
  ];
  for (const [q, type] of cases) {
    it(`classifies "${q}" as ${type}`, () => {
      assert.equal(analyzeQuestion(q).responseType, type);
    });
  }

  it("does not need a question mark", () => {
    assert.equal(analyzeQuestion("explain the difference between list and tuple").responseType, "comparison");
  });

  it("detects explicit follow-ups", () => {
    const a = analyzeQuestion("You mentioned API testing. How would you validate an API response?");
    assert.equal(a.isFollowUp, true);
  });

  it("treats short pronoun questions as follow-ups only when there is prior context", () => {
    const q = "And how does it handle that when the state changes?";
    assert.equal(analyzeQuestion(q).isFollowUp, false);
    const withHistory = analyzeQuestion(q, {
      history: [{ question: "What is the virtual DOM in React?", answer: "In-memory UI tree." }],
    });
    assert.equal(withHistory.isFollowUp, true);
    assert.match(describeAnalysis(withHistory, [{ question: "What is the virtual DOM in React?", answer: "x" }]), /virtual DOM/);
  });

  it("flags vague references so the model asks instead of inventing a topic", () => {
    const history = [{ question: "What are Kubernetes pods and deployments?", answer: "Pods run containers…" }];
    const a = analyzeQuestion("So what about the other one?", { history });
    assert.equal(a.vagueReference, true);
    assert.equal(a.isFollowUp, true);
    assert.match(describeAnalysis(a, history), /clarifying question/);
    assert.equal(analyzeQuestion("What is the other approach to caching besides LRU and LFU in Redis clusters?").vagueReference, false);
  });

  it("does not mark a self-contained question as follow-up", () => {
    const a = analyzeQuestion("What is the difference between inner join and left join?", {
      history: [{ question: "What is SQL?", answer: "A query language." }],
    });
    assert.equal(a.isFollowUp, false);
  });

  it("captures constraints", () => {
    const a = analyzeQuestion("Write a function to check a palindrome in Java, code only");
    assert.equal(a.codeOnly, true);
    assert.equal(a.language, "Java");
    assert.equal(analyzeQuestion("Briefly, what is REST?").brevity, "brief");
    assert.equal(analyzeQuestion("Explain garbage collection in detail").brevity, "detailed");
    assert.equal(analyzeQuestion("What is a generator, and when would you use one instead of a list?").multiPart, true);
  });

  it("budgets more tokens for code and fewer for brief answers", () => {
    const code = analyzeQuestion("Write a Python function to merge two sorted lists.");
    const brief = analyzeQuestion("Briefly, what is REST?");
    assert.ok(code.maxTokens >= 600);
    assert.ok(brief.maxTokens < 200);
    assert.ok(brief.targetWords[1] <= 50);
  });

  it("routes complex questions to the stronger tier", () => {
    assert.equal(analyzeQuestion("Write a SQL query to find the second highest salary.").complexity, "complex");
    assert.equal(analyzeQuestion("What is a REST API?").complexity, "simple");
  });

  it("flags personal-context questions only", () => {
    assert.equal(analyzeQuestion("Tell me about yourself").needsPersonalContext, true);
    assert.equal(analyzeQuestion("What is a hash map?").needsPersonalContext, false);
  });
});

describe("speech-to-text hints", () => {
  it("maps common technical mishearings", () => {
    assert.deepEqual(
      detectAsrHints("what is the difference between a list and a two pull in python").map(([, m]) => m),
      ["tuple"],
    );
    assert.ok(detectAsrHints("how do you write tests with pie test").some(([, m]) => m === "pytest"));
    assert.ok(detectAsrHints("have you used cube nettis").some(([, m]) => m === "Kubernetes"));
  });

  it("does not over-trigger on ordinary words", () => {
    assert.deepEqual(detectAsrHints("how do you pull data from an API?"), []);
    assert.deepEqual(detectAsrHints("how to pull the latest changes from git"), []);
  });
});

describe("conversation memory", () => {
  it("keeps recent exchanges verbatim and compresses older ones", () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      question: `Question ${i + 1}?`,
      answer: `Answer ${i + 1} ${"word ".repeat(200)}`,
    }));
    const memory = formatConversationMemory(history);
    assert.match(memory, /Earlier topics: Question 4\?/);
    assert.doesNotMatch(memory, /Question 3\?/);
    assert.match(memory, /Q: Question 15\?/);
    assert.match(memory, /Q: Question 13\?/);
    assert.doesNotMatch(memory, /Q: Question 12\?/);
    assert.ok(memory.length < 2600, `memory too large: ${memory.length}`);
  });

  it("injects memory and analysis into the prompt", () => {
    const prompt = buildUserPrompt({
      prompt: "How would you validate it?",
      mode: "answer",
      history: [{ question: "Have you done API testing?", answer: "Yes, with Postman." }],
      analysis: "Type: how_to.",
    });
    assert.match(prompt, /CONVERSATION SO FAR/);
    assert.match(prompt, /Candidate answered: Yes, with Postman\./);
    assert.match(prompt, /QUESTION ANALYSIS:\nType: how_to\./);
  });
});

describe("answer grounding contract", () => {
  it("only allows project facts from verified context", () => {
    const withBriefing = buildSystemInstruction("", true);
    const without = buildSystemInstruction("", false);
    assert.match(INTERVIEW_SYSTEM_PROMPT, /personal facts .* may come ONLY from the resume\/profile/);
    assert.match(withBriefing, /Never invent employers, metrics, or projects/);
    assert.match(without, /Do not invent a bio, employer, or project list/);
  });

  it("asks a short clarification instead of guessing when the question is unclear", () => {
    assert.match(INTERVIEW_SYSTEM_PROMPT, /genuinely ambiguous, give one short clarifying question/);
    assert.match(INTERVIEW_SYSTEM_PROMPT, /does not clearly point to something actually said, ask which one they mean instead of picking a new topic/);
  });

  it("passes a low-confidence transcript flag through to the model guidance", () => {
    const sure = analyzeQuestion("What is a Python decorator?");
    const unsure = analyzeQuestion("What is a Python decorator?", { uncertain: true });
    assert.equal(sure.lowConfidence, false);
    assert.equal(unsure.lowConfidence, true);
    assert.doesNotMatch(describeAnalysis(sure), /low-confidence/);
    assert.match(describeAnalysis(unsure), /low-confidence .* clarifying question instead of guessing/);
  });

  it("identifies the question first and keeps answers speakable", () => {
    assert.match(INTERVIEW_SYSTEM_PROMPT, /Answer the actual question\. Identify it/);
    assert.match(INTERVIEW_SYSTEM_PROMPT, /Match length to the question/);
    assert.match(INTERVIEW_SYSTEM_PROMPT, /never evidence that the candidate has those skills/);
  });

  it("marks project questions as needing verified personal context", () => {
    const a = analyzeQuestion("What database did you use in your payments project?");
    assert.equal(a.needsPersonalContext, true);
  });

  it("puts verified briefing text in the prompt for project questions", () => {
    const prompt = buildUserPrompt({
      prompt: "Tell me about the payments project you led.",
      mode: "answer",
      sessionContext: "CANDIDATE RESUME: Led the payments reconciliation service at Acme (Kafka, Postgres).",
    });
    assert.match(prompt, /payments reconciliation service at Acme/);
  });
});

type Route = (url: string, body: Record<string, unknown>, signal?: AbortSignal | null) => Response;

const realFetch = globalThis.fetch;
const calls: { url: string; model: unknown }[] = [];

function sse(tokens: string[]): Response {
  const body = tokens
    .map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`)
    .join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function installFetch(route: Route) {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    calls.push({ url, model: body.model });
    return route(url, body, init?.signal);
  }) as typeof fetch;
}

const base = {
  system: "s",
  prompt: "p",
  maxTokens: 200,
  complexity: "simple" as const,
  openAiKey: "test-openai",
  groqKey: "test-groq",
};

describe("provider routing", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetOpenAiCooldown();
  });

  it("uses OpenAI first when it works", async () => {
    installFetch((url) => (url.includes("openai.com") ? sse(["Hello", " world"]) : sse(["groq"])));
    const tokens: string[] = [];
    const r = await streamLiveAnswer({ ...base, onToken: (t) => tokens.push(t) });
    assert.equal(r.provider, "openai");
    assert.equal(r.text, "Hello world");
    assert.equal(tokens.join(""), "Hello world");
    assert.equal(calls.filter((c) => c.url.includes("groq.com")).length, 0);
  });

  it("falls back to Groq on OpenAI quota exhaustion and then skips OpenAI during cooldown", async () => {
    installFetch((url) =>
      url.includes("openai.com")
        ? new Response(JSON.stringify({ error: { code: "credit_balance_exhausted", message: "secret org detail" } }), { status: 429 })
        : sse(["from groq"]),
    );
    const r1 = await streamLiveAnswer({ ...base, onToken: () => undefined });
    assert.equal(r1.provider, "groq");
    assert.equal(r1.attempts[0]?.reason, "credit_balance_exhausted");
    assert.equal(openAiAvailable(), false);

    const r2 = await streamLiveAnswer({ ...base, onToken: () => undefined });
    assert.equal(r2.provider, "groq");
    assert.equal(calls.filter((c) => c.url.includes("openai.com")).length, 1, "OpenAI must not be retried during cooldown");
  });

  it("moves to the next Groq model on a per-model rate limit", async () => {
    installFetch((url, body) => {
      if (url.includes("openai.com")) return new Response("{}", { status: 503 });
      if (body.model === "openai/gpt-oss-20b") return new Response(JSON.stringify({ error: { message: "TPM" } }), { status: 429 });
      return sse(["120b answer"]);
    });
    const r = await streamLiveAnswer({ ...base, onToken: () => undefined });
    assert.equal(r.provider, "groq");
    assert.equal(r.model, "openai/gpt-oss-120b");
  });

  it("waits once for a short Groq rate limit instead of failing", async () => {
    let groqCalls = 0;
    installFetch((url) => {
      if (url.includes("openai.com")) return new Response("{}", { status: 503 });
      groqCalls++;
      if (groqCalls <= 2) {
        return new Response(
          JSON.stringify({ error: { message: "Rate limit reached. Please try again in 250ms." } }),
          { status: 429 },
        );
      }
      return sse(["after wait"]);
    });
    const r = await streamLiveAnswer({ ...base, onToken: () => undefined });
    assert.equal(r.text, "after wait");
    assert.equal(groqCalls, 3);
  });

  it("does not wait when Groq asks for a long backoff", async () => {
    installFetch((url) =>
      url.includes("openai.com")
        ? new Response("{}", { status: 503 })
        : new Response(JSON.stringify({ error: { message: "Please try again in 45.2s." } }), { status: 429 }),
    );
    const started = Date.now();
    await assert.rejects(streamLiveAnswer({ ...base, onToken: () => undefined }));
    assert.ok(Date.now() - started < 1_000);
  });

  it("sends low reasoning effort to gpt-oss models", async () => {
    let effort: unknown;
    installFetch((url, body) => {
      if (url.includes("groq.com")) effort = body.reasoning_effort;
      return sse(["ok"]);
    });
    await streamLiveAnswer({ ...base, openAiKey: "", onToken: () => undefined });
    assert.equal(effort, "low");
  });

  it("never falls back after tokens were already streamed", async () => {
    installFetch((url) => {
      if (url.includes("openai.com")) {
        let reads = 0;
        const stream = new ReadableStream({
          pull(controller) {
            if (reads++ === 0) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`));
            } else {
              controller.error(new Error("socket reset"));
            }
          },
        });
        return new Response(stream, { status: 200 });
      }
      return sse(["duplicate"]);
    });
    const tokens: string[] = [];
    await assert.rejects(
      streamLiveAnswer({ ...base, onToken: (t) => tokens.push(t) }),
      (err: unknown) => err instanceof LiveAnswerStreamError && err.partial,
    );
    assert.deepEqual(tokens, ["partial"]);
    assert.equal(calls.filter((c) => c.url.includes("groq.com")).length, 0);
  });

  it("aborts a stalled primary after the first-token timeout", async () => {
    installFetch((url, _body, signal) => {
      if (url.includes("openai.com")) {
        const stalled = new ReadableStream({
          start(controller) {
            signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
          },
        });
        return new Response(stalled, { status: 200 });
      }
      return sse(["fast fallback"]);
    });
    const started = Date.now();
    const r = await streamLiveAnswer({ ...base, onToken: () => undefined });
    assert.equal(r.provider, "groq");
    assert.equal(r.attempts[0]?.reason, "first_token_timeout");
    assert.ok(Date.now() - started < 6_000);
  });

  it("returns a generic error when every provider fails", async () => {
    installFetch(() => new Response(JSON.stringify({ error: { message: "org_123 internal" } }), { status: 500 }));
    await assert.rejects(
      streamLiveAnswer({ ...base, onToken: () => undefined }),
      (err: unknown) =>
        err instanceof LiveAnswerStreamError && !err.partial && !/org_123/.test(err.message),
    );
  });
});
