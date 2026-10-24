/**
 * Opt-in real-provider evaluation of live interview answers (makes paid/limited API calls).
 *
 * Runs regression questions through the same functions /api/live/answer uses
 * (analysis → prompt → provider chain → answer guard), scores each answer with
 * deterministic checks, and executes Python code answers in a short-lived subprocess
 * against fixed inputs. Code runs only on this developer machine, never on a server.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/eval-interview-answers.mts [label] [--only id1,id2] [--delay ms]
 *        npx tsx --tsconfig tsconfig.json scripts/eval-interview-answers.mts --rescore <label>   (no API calls)
 * Keys are read from .env.local and never printed. Results: .data/bench/answers-<label>.json (gitignored).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const LABEL = args.find((a) => !a.startsWith("--")) || "run";
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1]!.split(",")) : null;

const { analyzeQuestion, describeAnalysis } = await import("../src/lib/live-question");
const live = await import("../src/lib/live-answer");
const { streamLiveAnswer } = await import("../src/lib/server/live-answer-providers");
const guardMod = await import("../src/lib/live-answer-guard").catch(() => null);
const grounding = await import("../src/lib/live-grounding").catch(() => null);

/** Test fixture only: a fresher with two academic projects on different stacks. */
const FIXTURE_BRIEFING = `Interview at: Brightline Software
Job description:
Role: Junior Python Developer at Brightline Software.
Requirements: Python, Flask or FastAPI, REST APIs, SQL, Git. Nice to have: React, AWS, Docker.

CANDIDATE RESUME:
Name: Priya Sharma
Education: B.Tech in Computer Science, 2025 (final-year student), CGPA 8.4
Skills: Python, Flask, SQL (MySQL), HTML, CSS, basic JavaScript, Git, REST APIs
Internship: Python Developer Intern, Nexora Labs (3 months, 2024) — wrote Flask REST endpoints for an internal inventory tool and unit tests with pytest.
Projects:
1. AI Resume Analyzer (academic project) — Flask web app. User uploads a PDF resume; text is extracted with pdfplumber; the text plus a job description is sent to the Google Gemini API (gemini-1.5-flash) with a prompt asking for JSON (skills, missing keywords, suggestions); results shown on a results page. Tested manually with about 20 sample resumes. API key loaded from an environment variable via python-dotenv.
2. Library Management System (academic project) — PHP and MySQL CRUD app for issuing and returning books.
Certifications: none listed.`;

type Case = {
  id: string;
  question: string;
  history?: { question: string; answer: string }[];
  briefing?: string | null;
  must?: RegExp[];
  mustNot?: RegExp[];
  maxWords?: number;
  code?: "prime_check" | "prime_list";
};

const NO_FAKE_EXPERIENCE = [
  /\b\d+\+?\s*years? of (professional |industry |hands-on )?experience\b/i,
  /\b(led|managed|mentored) (a|the) team\b/i,
  /\b\d{1,3}\s?% (faster|reduction|improvement|increase|decrease|less|more)\b/i,
  /\breduced\b[^.]{0,40}\bby \d{1,3}\s?%/i,
];

const CASES: Case[] = [
  {
    id: "q1-intro",
    question: "Give me a ready-to-say self-introduction from my resume and the job briefing.",
    must: [/Priya/i, /Flask/i, /(Resume Analyzer|resume analy[sz]er)/i, /(intern|Nexora)/i],
    mustNot: [...NO_FAKE_EXPERIENCE, /\bAWS (expert|experience)\b|\bexperience (with|in) AWS\b/i, /\bReact (developer|expert)\b/i, /\b(XYZ|ABC|PQR) (University|College|Institute)\b/i],
    maxWords: 190,
  },
  {
    id: "q2-flask-fastapi",
    question: "Why did you use Flask instead of FastAPI?",
    must: [/Flask/i, /FastAPI/i, /(valid|async|asynchronous|documentation|docs)/i],
    mustNot: [/Flask (can'?t|cannot|does not|doesn'?t) (support|do|handle) async/i, /FastAPI is (always|automatically) faster/i, ...NO_FAKE_EXPERIENCE],
    maxWords: 170,
  },
  {
    id: "q3-project",
    question: "Explain your project.",
    must: [/(Resume Analyzer|resume)/i, /pdfplumber|PDF/i, /Gemini/i],
    mustNot: [...NO_FAKE_EXPERIENCE, /\b(200|hundreds of) resumes\b/i, /\bpilot\b/i, /\busers?\b[^.]{0,20}\b\d{3,}\b/i, /\bpytest\b/i],
    maxWords: 200,
  },
  {
    id: "q4-pdf",
    question: "How did you pass the PDF?",
    must: [/pdfplumber/i, /(text|extract)/i],
    mustNot: [/PyPDF2|PyMuPDF|fitz\b/i, /\bOCR\b(?![^.]{0,40}\b(not|n't|would|could|if)\b)/i],
    maxWords: 170,
  },
  {
    id: "q5-api-key",
    question: "Which API key did you use?",
    must: [/Gemini/i, /(environment variable|\.env|env var|dotenv|secret)/i],
    mustNot: [/AIza[0-9A-Za-z_-]{10,}|sk-[A-Za-z0-9]{10,}|gsk_[A-Za-z0-9]{10,}/, /\bOpenAI (API )?key\b/i],
    maxWords: 120,
  },
  {
    id: "q6-why-not-gpt",
    question: "Why not GPT?",
    history: [
      {
        question: "Which API key did you use?",
        answer:
          "For the AI Resume Analyzer I used the Google Gemini API with the gemini-1.5-flash model. The key is stored in an environment variable and loaded on the server with python-dotenv, never in the code.",
      },
    ],
    must: [/Gemini/i, /(GPT|OpenAI)/i, /(cost|latency|speed|JSON|structured|quality|free tier|context)/i],
    mustNot: [
      /\$\s?\d/,
      /\b\d+(\.\d+)?\s?(ms|milliseconds)\b/i,
      /\bbenchmark(ed)?\b(?![^.]{0,30}\b(not|didn'?t|no)\b)/i,
      /\bI (chose|picked|went with|selected)\b[^.]{0,60}\bbecause\b[^.]{0,80}\b(cost|cheaper|free tier|budget)\b/i,
      ...NO_FAKE_EXPERIENCE,
    ],
    maxWords: 150,
  },
  {
    id: "q7-react",
    question: "Do you know ReactJS? Explain.",
    must: [/component/i, /(state|props)/i],
    mustNot: [/\b(professional|production) (React|experience)\b[^.]{0,40}\bReact\b|\bI (have )?(built|deployed) (a |several |multiple )?(production|professional)\b/i, ...NO_FAKE_EXPERIENCE],
    maxWords: 170,
  },
  {
    id: "q8-php",
    question: "What is PHP?",
    must: [/server[- ]side/i, /(web|HTML|request)/i],
    maxWords: 110,
  },
  {
    id: "q9-event-loop",
    question: "How do you prevent event loop starvation without a separate process?",
    must: [/block/i, /(to_thread|run_in_executor|thread pool|executor)/i, /\bGIL\b|global interpreter lock/i],
    mustNot: [/threads? (always )?(run|execute)s? (CPU[- ]bound )?(Python )?code in parallel/i],
    maxWords: 230,
  },
  {
    id: "q10-asgi-cancel",
    question:
      "when the asgi request get cancelled client disconnect what happen to async task and how is the cleanup and cancel propagation task group in asyncio",
    must: [/CancelledError/i, /finally/i, /(re-?raise|raise it again)/i, /TaskGroup|task group/i],
    mustNot: [/finally[^.]{0,60}\b(always|guaranteed)\b[^.]{0,30}\b(finish|complete|run)/i, /shield[^.]{0,40}\b(always|solves|fixes)\b/i],
    maxWords: 260,
  },
  { id: "q11-prime-check", question: "Write a Python program to check a prime number without built-in functions", code: "prime_check", must: [/O\(/] },
  { id: "q12-prime-list", question: "Write a Python program to print prime numbers", code: "prime_list" },
  {
    id: "x-no-context-intro",
    question: "Tell me about yourself.",
    briefing: null,
    mustNot: [...NO_FAKE_EXPERIENCE, /\b(at|for) (google|amazon|microsoft|infosys|tcs|wipro|accenture)\b/i],
    maxWords: 170,
  },
  {
    id: "x-follow-up-why",
    question: "Why?",
    history: [
      {
        question: "Would you store the resume text in the database?",
        answer: "No, I would not store the full resume text by default. I would store only the analysis result and delete the uploaded file after processing.",
      },
    ],
    must: [/(privacy|personal|sensitive|storage|data)/i],
    maxWords: 120,
  },
];

function words(t: string) {
  return t.replace(/```[\s\S]*?```/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function extractPython(answer: string): string | null {
  const blocks = [...answer.matchAll(/```(?:python|py)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1]!);
  return blocks[0] ?? null;
}

function runPython(code: string, stdin: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "cueai-eval-"));
  try {
    writeFileSync(path.join(dir, "main.py"), code);
    const r = spawnSync("python", ["-I", "main.py"], {
      cwd: dir,
      input: stdin,
      timeout: 5000,
      encoding: "utf8",
      env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT } as unknown as NodeJS.ProcessEnv,
    });
    return { out: `${r.stdout || ""}`, err: `${r.stderr || ""}`.slice(-300), code: r.status, timedOut: r.error?.name === "Error" && /ETIMEDOUT/.test(String(r.error)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isPrime = (n: number) => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};

function verdict(out: string): boolean | null {
  const last = out.trim().split(/\r?\n/).pop() || "";
  const trailing = last.match(/\b(true|false)\W*$/i)?.[1];
  if (trailing) return trailing.toLowerCase() === "true";
  if (/\bnot\b[^\n]{0,12}\bprime\b|\bcomposite\b|\bneither\b/i.test(last)) return false;
  if (/\bprime\b/i.test(last)) return true;
  if (/\bfalse\b/i.test(last)) return false;
  if (/\btrue\b/i.test(last)) return true;
  return null;
}

function checkCode(kind: "prime_check" | "prime_list", code: string): string[] {
  const failures: string[] = [];
  const usesInput = /\binput\s*\(/.test(code);
  const fn = code.match(/^def\s+(\w*prime\w*)\s*\(\s*\w+\s*\)/im)?.[1];
  if (kind === "prime_check") {
    for (const n of [-7, 0, 1, 2, 3, 4, 17, 25, 97]) {
      const r = usesInput
        ? runPython(code, `${n}\n`)
        : fn
          ? runPython(`${code}\nprint(${fn}(${n}))\n`, "")
          : null;
      if (!r) return ["no input() and no prime function to call"];
      if (r.code !== 0) {
        failures.push(`n=${n}: exit ${r.code} ${r.err.split("\n").pop()}`);
        continue;
      }
      const v = verdict(r.out);
      if (v !== isPrime(n)) failures.push(`n=${n}: got "${r.out.trim().split(/\r?\n/).pop()}"`);
    }
  } else {
    for (const limit of [1, 2, 20, 50]) {
      const r = usesInput
        ? runPython(code, `${limit}\n`)
        : fn
          ? runPython(`${code}\n_r = ${fn}(${limit})\nif _r is not None: print(_r)\n`, "")
          : null;
      if (!r) return ["no input() and no prime function to call"];
      if (r.code !== 0) {
        failures.push(`limit=${limit}: exit ${r.code} ${r.err.split("\n").pop()}`);
        continue;
      }
      const nums = new Set((r.out.match(/-?\d+/g) || []).map(Number));
      nums.delete(limit);
      if (isPrime(limit)) nums.add(limit);
      const expected = Array.from({ length: limit + 1 }, (_, i) => i).filter(isPrime);
      const got = [...nums].filter((n) => n >= 0 && n <= limit).sort((a, b) => a - b);
      if (JSON.stringify(got) !== JSON.stringify(expected)) failures.push(`limit=${limit}: got [${got.join(",")}]`);
    }
  }
  return failures;
}

function score(c: Case, rawAnswer: string): string[] {
  const answer = rawAnswer.replace(/[\u2010\u2011]/g, "-");
  const failures: string[] = [];
  for (const re of c.must || []) if (!re.test(answer)) failures.push(`missing ${re}`);
  for (const re of c.mustNot || []) if (re.test(answer)) failures.push(`forbidden ${re}`);
  if (/^(sure|certainly|great question|that's a great question|of course|absolutely)\b/i.test(answer.trim())) failures.push("preamble");
  if (c.maxWords && words(answer) > c.maxWords) failures.push(`too long (${words(answer)}w > ${c.maxWords})`);
  if (c.code) {
    const code = extractPython(answer);
    if (!code) failures.push("no fenced Python code block");
    else failures.push(...checkCode(c.code, code));
  }
  return failures;
}

const rescoreIdx = args.indexOf("--rescore");
if (rescoreIdx >= 0) {
  // Re-score saved answers with the current checks (no provider calls).
  const label = args[rescoreIdx + 1]!;
  const saved = JSON.parse(readFileSync(`.data/bench/answers-${label}.json`, "utf8")) as { id: string; answer?: string }[];
  let ok = 0;
  for (const row of saved) {
    const c = CASES.find((x) => x.id === row.id);
    if (!c || !row.answer) {
      console.log(`${row.id.padEnd(20)} (no answer)`);
      continue;
    }
    const failures = score(c, row.answer);
    if (!failures.length) ok++;
    console.log(`${row.id.padEnd(20)} ${failures.length ? "FAIL " + failures.join("; ") : "PASS"}`);
  }
  console.log(`\n${label} (rescored): ${ok}/${saved.length} passed`);
  process.exit(0);
}

const delayIdx = args.indexOf("--delay");
const DELAY_MS = delayIdx >= 0 ? Number(args[delayIdx + 1]) || 0 : 0;

const groqKey = process.env.GROQ_API_KEY?.trim();
if (!groqKey) throw new Error("GROQ_API_KEY is not configured in .env.local");

const rows: unknown[] = [];
let pass = 0;
for (const [i, c] of CASES.filter((x) => !ONLY || ONLY.has(x.id)).entries()) {
  if (i && DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));
  const history = c.history || [];
  const briefing = c.briefing === null ? "" : c.briefing ?? FIXTURE_BRIEFING;
  const transcript = [...history.map((h) => ({ who: "Interviewer", text: h.question })), { who: "Interviewer", text: c.question }];
  const analysis = analyzeQuestion(c.question, { history, transcript });
  const system = live.buildSystemInstruction("", Boolean(briefing));
  const userPrompt = live.buildUserPrompt({
    prompt: c.question,
    transcript,
    mode: "answer",
    sessionContext: briefing,
    history,
    analysis: describeAnalysis(analysis, history),
    grounding: grounding ? grounding.groundingNotes(c.question, analysis, grounding.splitBriefing(briefing)) : undefined,
  });
  const t0 = performance.now();
  let ttft = -1;
  let r;
  try {
    r = await streamLiveAnswer({
      system,
      prompt: `${userPrompt}\n\nReply with the speakable answer only. No JSON. No preamble.`,
      maxTokens: analysis.maxTokens,
      complexity: analysis.complexity,
      temperature: 0.3,
      groqKey,
      groqModel: process.env.GROQ_MODEL?.trim() || undefined,
      gemini: null,
      onToken: () => {
        if (ttft < 0) ttft = Math.round(performance.now() - t0);
      },
    });
  } catch (err) {
    console.log(`${c.id.padEnd(20)} ERROR ${err instanceof Error ? err.message : err}`);
    rows.push({ id: c.id, error: String(err) });
    continue;
  }
  const total = Math.round(performance.now() - t0);
  const raw = r.text.trim();
  const guarded = guardMod
    ? guardMod.guardLiveAnswer(raw, { analysis, context: `${briefing}\n${history.map((h) => h.answer).join("\n")}` })
    : { answer: raw, changes: [] as string[] };
  const failures = score(c, guarded.answer);
  if (!failures.length) pass++;
  console.log(
    `${c.id.padEnd(20)} ${analysis.responseType.padEnd(14)} ttft=${String(ttft).padStart(5)}ms total=${String(total).padStart(5)}ms ${words(guarded.answer)}w ${failures.length ? "FAIL " + failures.join("; ") : "PASS"}${guarded.changes.length ? ` guard=${guarded.changes.join(",")}` : ""}`,
  );
  rows.push({ id: c.id, question: c.question, type: analysis.responseType, ttft, total, provider: `${r.provider}:${r.model}`, answer: guarded.answer, raw: guarded.changes.length ? raw : undefined, guard: guarded.changes, failures });
}

console.log(`\n${LABEL}: ${pass}/${rows.length} passed`);
mkdirSync(".data/bench", { recursive: true });
writeFileSync(`.data/bench/answers-${LABEL}.json`, JSON.stringify(rows, null, 2));
console.log(`Wrote .data/bench/answers-${LABEL}.json`);
