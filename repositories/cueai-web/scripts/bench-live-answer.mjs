#!/usr/bin/env node
/**
 * End-to-end live-answer benchmark against a running CueAI web server.
 *
 * Measures real time-to-first-token and full-answer latency through
 * POST /api/live/answer (SSE), and scores each answer with a deterministic rubric.
 *
 * Usage:
 *   BENCH_EMAIL=... BENCH_PASSWORD=... node scripts/bench-live-answer.mjs --label baseline --reps 3
 *
 * Options: --base http://127.0.0.1:3000  --label name  --reps N  --only id1,id2  --gap ms
 *          --rescore label   (re-apply the rubric to a saved run)
 * Results are written to .data/bench/<label>.json (gitignored).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), all[i + 1]?.startsWith("--") ? "1" : all[i + 1] ?? "1"]);
    return acc;
  }, []),
);

const BASE = (args.base || process.env.BENCH_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const LABEL = args.label || "run";
const REPS = Math.max(1, Number(args.reps || 3));
const ONLY = args.only ? new Set(String(args.only).split(",")) : null;
/** Pause between requests to simulate interview pacing (0 = back-to-back stress). */
const GAP_MS = Math.max(0, Number(args.gap || 0));

const email = process.env.BENCH_EMAIL;
const password = process.env.BENCH_PASSWORD;
if (!args.rescore && (!email || !password)) {
  console.error("Set BENCH_EMAIL and BENCH_PASSWORD for a local account.");
  process.exit(2);
}

/** Interview fixtures. `history` = earlier exchanges in the same session. */
const CASES = [
  {
    id: "py-decorator",
    question: "What is a decorator in Python?",
    must: [/wrap|wraps|wrapper/i, /function/i],
    maxWords: 110,
  },
  {
    id: "py-decorator-project",
    question: "Can you explain how you have used decorators in your project?",
    must: [/decorator/i, /(log|auth|retr|tim|cach|valid)/i],
    mustNot: [/\b(at|for) (google|amazon|microsoft|infosys|tcs|wipro|accenture)\b/i, /\b\d{2,3}% (faster|reduction|improvement)/i],
    maxWords: 140,
  },
  {
    id: "selenium-waits",
    question: "What is the difference between implicit wait and explicit wait in Selenium?",
    must: [/implicit/i, /explicit/i, /(global|every|all) (element|find|lookup)|whole (driver|session)|driver.?level/i, /condition|webdriverwait|expectedconditions/i],
    maxWords: 130,
  },
  {
    id: "api-followup",
    question: "You mentioned API testing. How would you validate an API response?",
    history: [
      {
        question: "Have you done API testing?",
        answer:
          "Yes. I've tested REST APIs with Postman and automated checks in Python using requests and pytest, covering positive, negative and boundary cases.",
      },
    ],
    transcript: [
      { who: "Interviewer", text: "Have you done API testing?" },
      { who: "Interviewer", text: "You mentioned API testing. How would you validate an API response?" },
    ],
    must: [/status code|2\d\d|4\d\d/i, /body|payload|field/i, /schema|data type|contract/i, /header|response time|latency/i],
    maxWords: 140,
  },
  {
    id: "code-reverse-ll",
    question: "Write a Python function to reverse a singly linked list.",
    must: [/def\s+\w+/, /\.next/, /O\(n\)/i],
    maxWords: 220,
  },
  {
    id: "sql-joins",
    question: "What is the difference between inner join and left join?",
    must: [/inner/i, /left/i, /null|unmatched|no match|non-matching/i],
    maxWords: 110,
  },
  {
    id: "scenario-flaky",
    question: "How would you debug a flaky Selenium test that passes locally but fails in CI?",
    must: [/wait|synchroni|timing/i, /(log|screenshot|video|trace)/i, /(headless|environment|browser version|resolution|parallel|data)/i],
    maxWords: 150,
  },
  {
    id: "rest-simple",
    question: "What is a REST API?",
    must: [/http/i, /(resource|endpoint)/i, /stateless/i],
    maxWords: 90,
  },
  {
    id: "tell-me",
    question: "Tell me about yourself.",
    mustNot: [/\b(at|for) (google|amazon|microsoft|infosys|tcs|wipro|accenture)\b/i, /\b\d+\+? years of experience at\b/i],
    must: [/\b(I|I'm|I am|my)\b/],
    maxWords: 140,
  },
  {
    id: "garbled-tuple",
    question: "what is the difference between a list and a two pull in python",
    must: [/tuple/i, /mutable|immutable|can't be changed|cannot be changed/i],
    maxWords: 110,
  },
  {
    id: "multi-generator",
    question: "What is a Python generator, and when would you use one instead of a list?",
    must: [/yield/i, /memory|lazy|on demand|one at a time|large/i],
    maxWords: 130,
  },
  {
    id: "ambiguous-it",
    question: "And how does it handle that when the state changes?",
    history: [
      {
        question: "What is the virtual DOM in React?",
        answer:
          "The virtual DOM is an in-memory representation of the UI. React renders components to it, diffs it with the previous version, and applies only the minimal changes to the real DOM.",
      },
    ],
    transcript: [
      { who: "Interviewer", text: "What is the virtual DOM in React?" },
      { who: "Interviewer", text: "And how does it handle that when the state changes?" },
    ],
    must: [/re[-\u2010\u2011]?render/i, /diff|reconcil/i, /react/i],
    maxWords: 130,
  },
  {
    id: "critical-01-rest-soap",
    question: "Explain the difference between REST and SOAP. When would you choose one over the other?",
    must: [/REST/i, /SOAP/i, /(choose|use).*?(REST|SOAP)|(REST|SOAP).*?(choose|use)/i],
    maxWords: 180,
  },
  {
    id: "critical-02-concurrent-api",
    question: "An API becomes slow only under concurrent load. Explain how you would investigate the bottleneck and validate the fix.",
    must: [/profil|trace|metric/i, /concurr|pool|lock|queue/i, /load test|benchmark/i],
    maxWords: 240,
  },
  {
    id: "critical-03-prod-query",
    question: "A query is fast in development but slow in production. Explain your investigation process, including query plans, indexes, locking, and data volume.",
    must: [/query plan|explain/i, /index/i, /lock/i, /data (volume|distribution)|cardinality/i],
    maxWords: 250,
  },
  {
    id: "critical-04-tenant-rag",
    question: "Design a reliable document-question-answering service that prevents one workspace from accessing another workspace's documents.",
    must: [/workspace|tenant/i, /authori[sz]|access control/i, /retriev|vector/i, /filter|partition|namespace/i],
    maxWords: 280,
  },
  {
    id: "critical-05-http-500",
    question: "A backend endpoint returns HTTP 500 intermittently. What evidence would you collect before changing the code?",
    must: [/log/i, /trace|request id|correlation/i, /metric/i],
    maxWords: 180,
  },
  {
    id: "critical-06-bapi-rfc-idoc",
    question: "Explain the difference between BAPI, RFC, and IDoc, and when each is appropriate.",
    must: [/BAPI/i, /RFC/i, /IDoc/i, /asynchronous|synchronous/i],
    maxWords: 220,
  },
  {
    id: "critical-07-idoc-error",
    question: "An IDoc remains in an error status in a production integration. Describe your troubleshooting sequence and how you would prevent duplicate processing.",
    must: [/status|WE02|WE05/i, /BD87|reprocess/i, /duplicate|idempoten/i],
    maxWords: 260,
  },
  {
    id: "critical-08-slow-abap",
    question: "Explain how you would investigate a slow ABAP report using internal tables, Open SQL, and runtime analysis.",
    must: [/internal table/i, /Open SQL/i, /SAT|ST05|runtime analysis/i],
    maxWords: 250,
  },
  {
    id: "critical-09-enhancements",
    question: "Explain the difference between user exits, customer exits, BAdIs, and enhancement points. Be clear about version-dependent details.",
    must: [/user exit/i, /customer exit/i, /BAdI/i, /enhancement point/i, /version|classic|new/i],
    maxWords: 250,
  },
  {
    id: "critical-10-cds",
    question: "A CDS view returns unexpected results or performs poorly. Explain how you would investigate associations, filters, joins, and database execution.",
    must: [/association/i, /filter/i, /join/i, /execution|plan|ST05/i],
    maxWords: 260,
  },
  {
    id: "critical-11-project",
    question: "Explain one project from your resume, including the problem, architecture, your contribution, challenges, and result.",
    must: [/\b(I|my)\b/i],
    mustNot: [/\b\d{2,3}% (improvement|increase|reduction)\b/i],
    maxWords: 260,
  },
  {
    id: "critical-12-change-decision",
    question: "Describe a technical decision in a project that you would change today. Explain the trade-offs and your improved approach.",
    must: [/trade-?off/i, /(would|I'd) (change|improve|choose)/i],
    mustNot: [/\b\d{2,3}% (improvement|increase|reduction)\b/i],
    maxWords: 240,
  },
  {
    id: "critical-13-difficult-bug",
    question: "Tell me about a difficult bug you fixed. Explain how you diagnosed the root cause and verified the solution.",
    must: [/\b(I|my)\b/i, /root cause|diagnos/i, /verif|test/i],
    mustNot: [/\b\d{2,3}% (improvement|increase|reduction)\b/i],
    maxWords: 230,
  },
  {
    id: "critical-14-deploy-failure",
    question: "The project is working locally but fails after deployment. Explain how you would investigate environment configuration, dependencies, networking, and logs.",
    must: [/environment|config/i, /dependenc/i, /network/i, /log/i],
    maxWords: 240,
  },
  {
    id: "critical-15-tech-choice",
    question: "Why did you choose the technologies in your project instead of the alternatives?",
    must: [/trade-?off|alternative/i],
    mustNot: [/\b\d{2,3}% (improvement|increase|reduction)\b/i],
    maxWords: 200,
  },
  {
    id: "critical-16-duplicates",
    question: "Write a program to find duplicate elements in an array.",
    must: [/```/i, /complexity|O\(/i],
    mustNot: [/```python/i],
    maxWords: 260,
  },
  {
    id: "critical-17-intervals",
    question: "Given a list of intervals, merge all overlapping intervals and explain the time complexity.",
    must: [/sort/i, /O\(n\s*log\s*n\)/i],
    maxWords: 300,
  },
  {
    id: "critical-18-rate-limiter",
    question: "Implement a thread-safe rate limiter or explain a suitable algorithm, including concurrency and edge cases.",
    must: [/token bucket|sliding window|leaky bucket/i, /lock|atomic|synchron/i, /edge case|clock/i],
    maxWords: 320,
  },
  {
    id: "critical-19-voice-complete",
    question: "What is the difference between optimistic and pessimistic locking?",
    must: [/optimistic/i, /pessimistic/i, /conflict|lock/i],
    maxWords: 160,
  },
  {
    id: "critical-20-multisentence",
    question: "Our API is timing out under load. Explain how you would isolate the cause. Then describe how you would validate the fix without risking production.",
    must: [/isolate|trace|profil|metric/i, /load test|staging|canary/i, /production/i],
    maxWords: 260,
  },
  ...["Java", "Python", "C", "C++", "JavaScript", "SQL", "ABAP"].map((language) => ({
    id: `language-${language.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    question:
      language === "SQL"
        ? "Using SQL, find duplicate email addresses in a users table."
        : language === "ABAP"
          ? "Using ABAP, find duplicate values in an internal table."
          : `Using ${language}, write a program to find duplicate elements in an array.`,
    must: [new RegExp(language.replace("+", "\\+"), "i")],
    expectedLanguage: language,
    maxWords: 280,
  })),
];

const PREAMBLE = /^(sure|certainly|great question|that's a great question|as an ai|let me explain|of course|absolutely)\b/i;

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function score(c, answer, route = {}) {
  const failures = [];
  for (const re of c.must || []) if (!re.test(answer)) failures.push(`missing ${re}`);
  for (const re of c.mustNot || []) if (re.test(answer)) failures.push(`forbidden ${re}`);
  if (PREAMBLE.test(answer.trim())) failures.push("preamble");
  if (c.expectedLanguage && route.selectedLanguage !== c.expectedLanguage) {
    failures.push(`selected ${route.selectedLanguage || "none"}, expected ${c.expectedLanguage}`);
  }
  const w = words(answer);
  if (c.maxWords && w > c.maxWords) failures.push(`too long (${w}w > ${c.maxWords})`);
  return { pass: failures.length === 0, failures, words: w };
}

function pct(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const cookies = res.headers.getSetCookie?.() || [];
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("login returned no session cookie");
  return cookie;
}

async function runOnce(cookie, c) {
  const started = performance.now();
  const res = await fetch(`${BASE}/api/live/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Cookie: cookie },
    body: JSON.stringify({
      prompt: c.question,
      transcript: c.transcript || [{ who: "Interviewer", text: c.question }],
      history: c.history || [],
      stream: true,
      mode: "answer",
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 160)}` };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ttft = null;
  let full = "";
  let done = null;
  let meta = null;
  let error = null;
  while (true) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      let evt;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "token" && evt.text) {
        if (ttft == null) ttft = performance.now() - started;
        full += evt.text;
      } else if (evt.type === "meta") {
        meta = evt;
      } else if (evt.type === "done") {
        done = evt;
      } else if (evt.type === "error") {
        error = evt.error;
      }
    }
  }
  const total = performance.now() - started;
  const answer = (done?.answer || full).trim();
  if (error && !answer) return { ok: false, error };
  return {
    ok: true,
    ttftMs: ttft == null ? total : ttft,
    totalMs: total,
    provider: done?.provider || "unknown",
    model: done?.model || "unknown",
    category: done?.category || meta?.category || "unknown",
    selectedLanguage: done?.selectedLanguage || meta?.selectedLanguage || null,
    languageSource: done?.languageSource || meta?.languageSource || null,
    answer,
  };
}

async function main() {
  const cookie = await login();
  const cases = CASES.filter((c) => !ONLY || ONLY.has(c.id));
  // Warm the route so compile time is not measured.
  await runOnce(cookie, { question: "What is a variable?" });

  const rows = [];
  for (let rep = 0; rep < REPS; rep++) {
    for (const c of cases) {
      const r = await runOnce(cookie, c);
      const q = r.ok ? score(c, r.answer, r) : { pass: false, failures: [r.error], words: 0 };
      rows.push({ id: c.id, rep, ...r, quality: q });
      const tag = r.ok ? `${Math.round(r.ttftMs)}ms/${Math.round(r.totalMs)}ms ${r.provider}` : "ERROR";
      console.log(`[${rep + 1}/${REPS}] ${c.id.padEnd(22)} ${tag.padEnd(28)} ${q.pass ? "PASS" : "FAIL " + q.failures.join("; ")}`);
      if (GAP_MS) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    }
  }

  const ok = rows.filter((r) => r.ok);
  const ttft = ok.map((r) => r.ttftMs);
  const total = ok.map((r) => r.totalMs);
  const summary = {
    label: LABEL,
    base: BASE,
    reps: REPS,
    gapMs: GAP_MS,
    cases: cases.length,
    requests: rows.length,
    errors: rows.length - ok.length,
    providers: ok.reduce((acc, r) => ((acc[`${r.provider}:${r.model}`] = (acc[`${r.provider}:${r.model}`] || 0) + 1), acc), {}),
    ttftMs: { p50: pct(ttft, 50), p95: pct(ttft, 95), p99: pct(ttft, 99) },
    totalMs: { p50: pct(total, 50), p95: pct(total, 95), p99: pct(total, 99) },
    qualityPass: rows.filter((r) => r.quality.pass).length,
    avgWords: ok.length ? Math.round(ok.reduce((s, r) => s + r.quality.words, 0) / ok.length) : 0,
  };
  for (const k of ["ttftMs", "totalMs"]) {
    for (const p of ["p50", "p95", "p99"]) summary[k][p] = summary[k][p] == null ? null : Math.round(summary[k][p]);
  }
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));

  const outDir = path.join(process.cwd(), ".data", "bench");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${LABEL}.json`), JSON.stringify({ summary, rows }, null, 2));
  console.log(`\nWrote .data/bench/${LABEL}.json`);
}

/** Re-apply the current rubric to saved answers (latency numbers are unchanged). */
async function rescore(label) {
  const { readFile } = await import("node:fs/promises");
  const file = path.join(process.cwd(), ".data", "bench", `${label}.json`);
  const saved = JSON.parse(await readFile(file, "utf8"));
  const byId = new Map(CASES.map((c) => [c.id, c]));
  let pass = 0;
  const failures = {};
  for (const row of saved.rows) {
    const c = byId.get(row.id);
    const q = row.ok && c ? score(c, row.answer, row) : { pass: false, failures: [row.error || "error"] };
    if (q.pass) pass++;
    else failures[row.id] = [...(failures[row.id] || []), q.failures.join("; ")];
  }
  console.log(JSON.stringify({ label, requests: saved.rows.length, qualityPass: pass, failures }, null, 2));
}

(args.rescore ? rescore(args.rescore) : main()).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
