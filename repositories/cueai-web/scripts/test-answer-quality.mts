/**
 * Answer-quality contract tests: question understanding, resume/job grounding, and the
 * deterministic answer guard. No network calls; model outputs are fixed strings.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { analyzeQuestion, describeAnalysis } = await import("../src/lib/live-question");
const { buildUserPrompt } = await import("../src/lib/live-answer");
const { groundingNotes, splitBriefing, techEvidence } = await import("../src/lib/live-grounding");
const { guardLiveAnswer, checkPythonStatic, checkBracesStatic, redactSecrets } = await import(
  "../src/lib/live-answer-guard"
);

const BRIEFING = `Interview at: Brightline Software
Job description:
Junior Python Developer. Requirements: Python, Flask or FastAPI, REST APIs, SQL. Nice to have: React, AWS, Docker.
Resume on file: resume.pdf
CANDIDATE RESUME:
Asha Rao. B.Tech Computer Science 2025. Skills: Python, Flask, MySQL, basic JavaScript.
Project: AI Resume Analyzer — Flask app; PDF text extracted with pdfplumber; text sent to the Gemini API; key loaded from an environment variable.
Guidance: balanced`;

const prior = [{ question: "Which API key did you use?", answer: "I used the Gemini API key from an environment variable." }];

describe("question understanding", () => {
  const cases: [string, string, string, { history?: typeof prior }?][] = [
    ["Give me a ready-to-say self-introduction from my resume and the job briefing.", "introduction", "self_introduction"],
    ["Why did you use Flask instead of FastAPI?", "comparison", "framework_comparison"],
    ["Explain your project.", "project", "project"],
    ["How did you pass the PDF?", "project", "project"],
    ["Which API key did you use?", "project", "project"],
    ["Why not GPT?", "why", "follow_up", { history: prior }],
    ["Do you know ReactJS? Explain.", "experience", "resume_background"],
    ["What is PHP?", "definition", "programming_language"],
    ["Write a Python program to check a prime number without built-in functions", "coding", "coding"],
    ["Write a Python program to print prime numbers", "coding", "coding"],
    ["Merge two arrays", "coding", "coding"],
    ["Flatten a nested array in JavaScript", "coding", "coding"],
    ["Design a URL shortener", "scenario", "system_design"],
    ["What is a database index and when does it hurt writes?", "definition", "database"],
    ["What HTTP status code should a REST API return for a validation error?", "general", "backend_api"],
  ];
  for (const [q, type, category, ctx] of cases) {
    it(`${q} -> ${type}/${category}`, () => {
      const a = analyzeQuestion(q, ctx);
      assert.equal(a.responseType, type);
      assert.equal(a.category, category);
    });
  }

  it("fetches the resume for past-tense personal questions", () => {
    for (const q of ["How did you pass the PDF?", "Which API key did you use?", "Why did you use Flask instead of FastAPI?", "Do you know ReactJS? Explain."]) {
      assert.equal(analyzeQuestion(q).needsPersonalContext, true, q);
    }
    assert.equal(analyzeQuestion("Why not GPT?", { history: prior }).needsPersonalContext, true);
    assert.equal(analyzeQuestion("What is PHP?").needsPersonalContext, false);
    assert.equal(analyzeQuestion("How do you handle exceptions in Java?").needsPersonalContext, false);
  });

  it("treats terse why-questions as follow-ups only when there is a previous turn", () => {
    assert.equal(analyzeQuestion("Why not GPT?", { history: prior }).isFollowUp, true);
    assert.equal(analyzeQuestion("Why?", { history: prior }).isFollowUp, true);
    assert.equal(analyzeQuestion("Why not GPT?").isFollowUp, false);
  });

  it("gives advanced and run-on technical questions a deeper budget", () => {
    const loop = analyzeQuestion("How do you prevent event loop starvation without a separate process?");
    assert.equal(loop.complexity, "complex");
    assert.ok(loop.targetWords[1] >= 150);
    const asgi = analyzeQuestion(
      "when the asgi request get cancelled client disconnect what happen to async task and how is the cleanup and cancel propagation task group in asyncio",
    );
    assert.equal(asgi.malformed, true);
    assert.match(describeAnalysis(asgi), /run-on transcript/);
    assert.match(describeAnalysis(asgi), /exact exception names/);
    assert.equal(analyzeQuestion("What is PHP?").complexity, "simple");
  });

  it("keeps definitions short and coding answers roomy", () => {
    const php = analyzeQuestion("What is PHP?");
    assert.ok(php.targetWords[1] <= 70);
    assert.ok(analyzeQuestion("Write a Python program to print prime numbers").maxTokens >= 600);
  });

  it("adds coding directives for constraints, ambiguity and runnable programs", () => {
    const prime = analyzeQuestion("Write a Python program to check a prime number without built-in functions");
    assert.equal(prime.noBuiltins, true);
    const d = describeAnalysis(prime);
    assert.match(d, /math\.isqrt/);
    assert.match(d, /reads input with input\(\)/);
    assert.match(d, /Example: line/);
    assert.match(d, /Time\/Space complexity/);
    assert.match(d, /Never hardcode a single sample value/);
    assert.match(describeAnalysis(analyzeQuestion("Merge two arrays")), /merge two sorted arrays/);
    assert.match(describeAnalysis(analyzeQuestion("Flatten a nested array in JavaScript")), /one level or any depth/);
  });

  it("blocks invented rationales for choice questions, including terse follow-ups", () => {
    assert.equal(analyzeQuestion("Why not GPT?", { history: prior }).asksRationale, true);
    assert.equal(analyzeQuestion("Why did you use Flask instead of FastAPI?").asksRationale, true);
    assert.equal(analyzeQuestion("Why is Python dynamically typed?").asksRationale, false);
    assert.match(describeAnalysis(analyzeQuestion("Why not GPT?", { history: prior }), prior), /do not invent reasons/);
  });

  it("adds accuracy notes only for matching technical topics", () => {
    assert.match(describeAnalysis(analyzeQuestion("How do you prevent event loop starvation?")), /GIL/);
    assert.match(
      describeAnalysis(analyzeQuestion("What happens to async tasks when the ASGI client disconnects?")),
      /re-raise it/,
    );
    assert.doesNotMatch(describeAnalysis(analyzeQuestion("How would you cancel an order in an e-commerce app?")), /CancelledError/);
    assert.doesNotMatch(describeAnalysis(analyzeQuestion("What is PHP?")), /Accuracy notes/);
  });

  it("tells the model never to output credentials", () => {
    assert.match(describeAnalysis(analyzeQuestion("Which API key did you use?")), /never output a key/);
  });
});

describe("resume vs job-description grounding", () => {
  const parts = splitBriefing(BRIEFING);

  it("separates candidate facts from job requirements", () => {
    assert.match(parts.candidate, /pdfplumber/);
    assert.doesNotMatch(parts.candidate, /Nice to have/);
    assert.match(parts.job, /React, AWS, Docker/);
    assert.doesNotMatch(parts.job, /pdfplumber/);
  });

  it("classifies technologies by evidence", () => {
    const ev = Object.fromEntries(techEvidence("Flask, AWS, React or Kubernetes?", parts).map((e) => [e.term, e.status]));
    assert.equal(ev.Flask, "candidate");
    assert.equal(ev.AWS, "job_only");
    assert.equal(ev.React, "job_only");
    assert.equal(ev.Kubernetes, "absent");
  });

  it("warns that job-only skills are not experience", () => {
    const q = "Do you know ReactJS? Explain.";
    const notes = groundingNotes(q, analyzeQuestion(q), parts);
    assert.match(notes, /never evidence that the candidate has those skills/);
    assert.match(notes, /React: appears only in the job requirements/);
  });

  it("flags technologies missing from the resume on personal questions", () => {
    const q = "Have you used Kubernetes?";
    assert.match(groundingNotes(q, analyzeQuestion(q), parts), /Kubernetes: not in the candidate's resume/);
  });

  it("forbids personal facts when no resume or profile exists", () => {
    const q = "Tell me about yourself.";
    const notes = groundingNotes(q, analyzeQuestion(q), splitBriefing(""));
    assert.match(notes, /No resume or profile is available/);
    assert.match(notes, /\[bracketed placeholders\]/);
  });

  it("treats the verified profile as candidate evidence", () => {
    const p = splitBriefing("", "Name: Asha Rao. Skills: Docker, Python and Flask for two years of coursework.");
    assert.equal(techEvidence("Docker?", p)[0]?.status, "candidate");
  });

  it("does not invent a rationale for why a technology was chosen", () => {
    const q = "Why did you use Flask instead of FastAPI?";
    assert.match(groundingNotes(q, analyzeQuestion(q), parts), /state a reason only if the resume gives one/);
  });

  it("puts grounding notes into the model prompt", () => {
    const prompt = buildUserPrompt({ prompt: "Do you know React?", mode: "answer", grounding: "- React: appears only in the job requirements" });
    assert.match(prompt, /GROUNDING \(what may be claimed about the candidate\):\n- React/);
  });

  it("only uses the context it is given", () => {
    const other = splitBriefing("CANDIDATE RESUME:\nOther user: Kubernetes at Google for 6 years.");
    assert.doesNotMatch(parts.candidate, /Google|Kubernetes/);
    assert.match(other.candidate, /Kubernetes/);
  });
});

describe("answer guard", () => {
  const ctx = BRIEFING;

  it("strips filler preambles", () => {
    assert.equal(guardLiveAnswer("Sure, here's the answer: PHP is a server-side language.").answer, "PHP is a server-side language.");
    assert.equal(guardLiveAnswer("Great question! PHP runs on the server.").answer, "PHP runs on the server.");
  });

  it("redacts secrets anywhere, including code", () => {
    const fake = `sk-${"a1".repeat(16)}`;
    const google = `AIza${"B".repeat(35)}`;
    const r = guardLiveAnswer(`My key was ${google}.\n\`\`\`python\nkey = "${fake}"\n\`\`\``);
    assert.doesNotMatch(r.answer, /AIzaB{10}|sk-a1a1/);
    assert.ok(r.changes.includes("secret_redacted"));
    assert.equal(redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456").text, "Authorization: Bearer [redacted]");
  });

  it("removes fabricated experience, metrics, scale, leadership and employers", () => {
    const raw =
      "I'm Asha, a final-year B.Tech student. I have five years of experience building APIs. I led a team of four on the analyzer. It improved accuracy by 40%. It served millions of users. I interned at Google last summer. I built the AI Resume Analyzer with Flask and pdfplumber.";
    const r = guardLiveAnswer(raw, { context: ctx, analysis: analyzeQuestion("Explain your project.") });
    assert.match(r.answer, /final-year B\.Tech student/);
    assert.match(r.answer, /AI Resume Analyzer with Flask and pdfplumber/);
    for (const bad of [/five years/, /led a team/, /40%/, /millions/, /Google/]) assert.doesNotMatch(r.answer, bad);
    assert.deepEqual(
      new Set(r.changes),
      new Set(["unsupported_years_removed", "unsupported_leadership_removed", "unsupported_metric_removed", "unsupported_scale_removed", "unsupported_employer_removed"]),
    );
  });

  it("drops leadership claims from a no-resume template", () => {
    const raw = "Hi, I'm [Your Name], a graduate in [Your Major]. I also led a small team on a [project]. I enjoy backend work.";
    const r = guardLiveAnswer(raw, { context: "Tell me about yourself.", analysis: analyzeQuestion("Tell me about yourself.") });
    assert.equal(r.answer, "Hi, I'm [Your Name], a graduate in [Your Major]. I enjoy backend work.");
  });

  it("keeps claims that the context supports", () => {
    const supported = "CANDIDATE RESUME:\n5 years of experience as a backend engineer. Led a team of 3. Cut latency by 30%.";
    const raw = "I have 5 years of experience as a backend engineer. I led a team of three. We cut latency by 30%.";
    assert.equal(guardLiveAnswer(raw, { context: supported }).answer, raw);
  });

  it("does not treat general technical facts or provider names as personal claims", () => {
    const raw = "Python 3.11 is about 25% faster than 3.10 in some benchmarks. I used the Google Gemini API with an environment variable for the key.";
    assert.equal(guardLiveAnswer(raw, { context: ctx }).answer, raw);
  });

  it("never edits code when filtering claims", () => {
    const raw = "Here is the idea.\n```python\n# I have 10 years of experience\nprint('100% done')\n```\nIt prints once.";
    assert.match(guardLiveAnswer(raw, { context: "" }).answer, /# I have 10 years of experience\nprint\('100% done'\)/);
  });

  it("fences bare code for coding questions and closes a dangling fence", () => {
    const analysis = analyzeQuestion("Write a Python program to print prime numbers");
    const bare = guardLiveAnswer("Use trial division.\ndef is_prime(n):\n    if n < 2:\n        return False\n    return True\nprint(is_prime(7))", { analysis });
    assert.ok(bare.changes.includes("code_fenced"));
    assert.match(bare.answer, /```python\ndef is_prime\(n\):/);
    const open = guardLiveAnswer("```python\nprint(1)\n", { analysis });
    assert.ok(open.changes.includes("fence_closed"));
    assert.equal(open.validationStatus, "static_ok");
  });

  it("validates a correct beginner prime program statically, without claiming execution", () => {
    const answer = [
      "I'll check divisors from 2 up to the square root using i * i <= n.",
      "```python",
      "n = int(input())",
      "",
      "if n < 2:",
      "    print(n, \"is not a prime number\")",
      "else:",
      "    is_prime = True",
      "    i = 2",
      "    while i * i <= n:",
      "        if n % i == 0:",
      "            is_prime = False",
      "            break",
      "        i += 1",
      "    if is_prime:",
      "        print(n, \"is a prime number\")",
      "    else:",
      "        print(n, \"is not a prime number\")",
      "```",
      "Example: input 17 prints \"17 is a prime number\". Time O(√n), space O(1).",
    ].join("\n");
    const r = guardLiveAnswer(answer, { analysis: analyzeQuestion("Write a Python program to check a prime number") });
    assert.equal(r.validationStatus, "static_ok");
    assert.deepEqual(r.issues, []);
    assert.ok(!["passed", "executed", "tests_passed"].includes(r.validationStatus));
  });

  it("reports malformed Python", () => {
    assert.match(checkPythonStatic("def f(n):\nreturn n").join(), /expected an indented block/);
    assert.match(checkPythonStatic("def f(n)\n    return n").join(), /missing colon/);
    assert.match(checkPythonStatic("print((1, 2)").join(), /unclosed/);
    assert.match(checkPythonStatic("x = 1\n    y = 2").join(), /unexpected indent/);
    assert.match(checkPythonStatic("if x:\n        a = 1\n    b = 2").join(), /unindent does not match/);
    assert.deepEqual(checkPythonStatic("def f(\n    a,\n    b,\n):\n    return a + b\ns = \"if x\"\n"), []);
    const r = guardLiveAnswer("```python\nfor i in range(3)\n    print(i)\n```");
    assert.equal(r.validationStatus, "static_issues");
  });

  it("checks brace balance for C-family languages", () => {
    assert.deepEqual(checkBracesStatic("function f(a) { return [a, '}']; }"), []);
    assert.match(checkBracesStatic("function f(a) { return a;").join(), /unclosed/);
  });

  it("removes invented placeholder institutions but keeps honest bracketed placeholders", () => {
    const r = guardLiveAnswer("I'm Asha, a final-year student at XYZ University, graduating in 2025.", { context: ctx });
    assert.equal(r.answer, "I'm Asha, a final-year student, graduating in 2025.");
    assert.ok(r.changes.includes("placeholder_removed"));
    const template = "I'm [Your Name], a [degree] student at [Your University].";
    assert.equal(guardLiveAnswer(template, { context: "Tell me about yourself." }).answer, template);
  });

  it("normalizes non-breaking hyphens and smart quotes inside code", () => {
    const r = guardLiveAnswer("PHP is a server\u2011side language.\n```python\nprint(\u201Chi\u201D)\n```");
    assert.match(r.answer, /server-side/);
    assert.match(r.answer, /print\("hi"\)/);
    assert.equal(r.validationStatus, "static_ok");
  });

  it("marks answers without code as not applicable", () => {
    assert.equal(guardLiveAnswer("PHP is a server-side scripting language.").validationStatus, "not_applicable");
  });
});
