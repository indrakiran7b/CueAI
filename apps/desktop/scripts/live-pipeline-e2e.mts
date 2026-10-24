/**
 * Real-audio, real-provider benchmark of the overlay audio → answer pipeline.
 *
 * Plays generated spoken questions (scripts/make-speech-fixtures.ps1) in real time,
 * with a low noise floor, through a pipeline adapter. The adapter uses the overlay's
 * own segmenter / turn detection / auto-answer code, transcribes through the running
 * web app's /api/transcribe (Groq Whisper) and answers through /api/live/answer.
 * Every stage is timed against the known last voiced sample of each question.
 *
 * Nothing is mocked: this needs the web app running and a real account.
 *
 *   BENCH_EMAIL=... BENCH_PASSWORD=... npx tsx scripts/live-pipeline-e2e.mts
 *     --pipeline new|legacy   (legacy loads .bench/legacy/adapter.mts)
 *     --label name  --gap ms  --only id,id  --base http://127.0.0.1:3000
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, cur, i, all) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), all[i + 1]?.startsWith("--") ? "1" : all[i + 1] ?? "1"]);
    return acc;
  }, []),
);
const BASE = (args.base || "http://127.0.0.1:3000").replace(/\/$/, "");
const PIPELINE = args.pipeline || "new";
const LABEL = args.label || PIPELINE;
const GAP_MS = Number(args.gap || 8000);
const ONLY = args.only ? new Set(args.only.split(",")) : null;
const SAMPLE_RATE = 16_000;
/** ~42.7 ms, the same cadence as a 2048-frame ScriptProcessor at 48 kHz. */
const CHUNK = 683;

export type PipelineEvents = {
  transcript(info: { who: string; text: string; partial: boolean; at: number }): void;
  transcribeTiming(info: { ms: number; ok: boolean; kind: string }): void;
  answerRequested(info: { id: string; question: string; at: number }): void;
  firstToken(info: { id: string; at: number }): void;
  answerComplete(info: { id: string; answer: string; at: number }): void;
  answerAborted(info: { id: string; at: number }): void;
  answerFailed(info: { id: string; error: string; at: number }): void;
  skipped(info: { text: string; reason: string; at: number }): void;
};

export type PipelineAdapter = {
  name: string;
  start(events: PipelineEvents): Promise<void> | void;
  push(chunk: Float32Array, now: number): void;
  idle(): boolean;
  stop(): Promise<void>;
};

type Step = {
  id: string;
  text: string;
  gapAfterMs: number;
  startAt: number;
  lastVoiceAt: number;
};

/** Session order; two-q-b follows two-q-a almost immediately to test interruption. */
const SCRIPT: { id: string; gap?: number }[] = [
  { id: "short-decorator" },
  { id: "list-tuple" },
  { id: "selenium-stale" },
  { id: "rest-pause" },
  { id: "long-pause-tail" },
  { id: "project" },
  { id: "followup-why" },
  { id: "gc-java" },
  { id: "two-q-a", gap: 1000 },
  { id: "two-q-b" },
  { id: "react-render" },
  { id: "spring-di" },
  { id: "sql-slow" },
  { id: "kubernetes" },
  { id: "ambiguous" },
];

/** Minimal relevance rubric: the answer must touch these ideas. */
const RUBRIC: Record<string, RegExp[]> = {
  "short-decorator": [/function/i, /wrap|modif|extend|behavio/i],
  "list-tuple": [/mutab|immutab|change/i, /tuple/i],
  "selenium-stale": [/stale/i, /re[-\u2010\u2011]?(locat|fetch|query)|find .*again/i, /wait|retry/i],
  "rest-pause": [/idempoten/i, /key|token|id/i, /retr/i],
  "long-pause-tail": [/process/i, /thread/i, /memory|address space/i],
  "gc-java": [/garbage|gc/i, /heap|generation|reachab|mark/i],
  "two-q-b": [/graphql/i],
  "react-render": [/virtual dom|reconcil|diff/i, /re-?render|state|props/i],
  "spring-di": [/depend/i, /inject|bean|container/i],
  "sql-slow": [/index/i, /plan|explain|join/i],
  kubernetes: [/pod/i, /deployment/i, /replica|manage|desired/i],
};

function readWav(buf: Buffer): Float32Array {
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      const n = Math.floor(size / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

function voicedBounds(samples: Float32Array) {
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]!) > 0.01) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return { first: Math.max(0, first), last: Math.max(0, last) };
}

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate of `hyp` against `ref`. */
function wer(ref: string, hyp: string) {
  const r = words(ref);
  const h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0]![j] = j;
  for (let i = 1; i <= r.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1),
      );
    }
  }
  return r.length ? d[r.length]![h.length]! / r.length : 0;
}

function pct(values: number[], p: number) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!);
}

function stats(values: number[]) {
  return { n: values.length, p50: pct(values, 50), p95: pct(values, 95), p99: pct(values, 99) };
}

async function login(): Promise<string> {
  const email = process.env.BENCH_EMAIL;
  const password = process.env.BENCH_PASSWORD;
  if (!email || !password) throw new Error("Set BENCH_EMAIL and BENCH_PASSWORD.");
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("login returned no session cookie");
  return cookie;
}

async function main() {
  const audioDir = path.join(root, ".bench", "audio");
  const manifest = JSON.parse(
    (await readFile(path.join(audioDir, "manifest.json"), "utf8")).replace(/^\uFEFF/, ""),
  ) as { id: string; text: string }[];
  const textOf = new Map(manifest.map((m) => [m.id, m.text]));

  const cookie = await login();
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(BASE)) return realFetch(input, init);
    const headers = new Headers(init.headers || {});
    if (!headers.has("cookie")) headers.set("cookie", cookie);
    return realFetch(input, { ...init, headers });
  }) as typeof fetch;

  const quiet = !args.verbose;
  const origLog = console.log;
  if (quiet) console.log = () => undefined;

  // Build the session timeline.
  const lead = Math.round(SAMPLE_RATE * 1.5);
  const parts: Float32Array[] = [new Float32Array(lead)];
  const steps: Step[] = [];
  let cursor = lead;
  for (const s of SCRIPT) {
    if (ONLY && !ONLY.has(s.id)) continue;
    const pcm = readWav(await readFile(path.join(audioDir, `${s.id}.wav`)));
    const b = voicedBounds(pcm);
    const gap = s.gap ?? GAP_MS;
    steps.push({
      id: s.id,
      text: textOf.get(s.id) || "",
      gapAfterMs: gap,
      startAt: ((cursor + b.first) / SAMPLE_RATE) * 1000,
      lastVoiceAt: ((cursor + b.last) / SAMPLE_RATE) * 1000,
    });
    parts.push(pcm, new Float32Array(Math.round((gap / 1000) * SAMPLE_RATE)));
    cursor += pcm.length + Math.round((gap / 1000) * SAMPLE_RATE);
  }
  const timeline = new Float32Array(cursor);
  let o = 0;
  for (const p of parts) {
    timeline.set(p, o);
    o += p.length;
  }
  // Deterministic low noise floor so VAD sees realistic (non-zero) silence.
  let seed = 12345;
  for (let i = 0; i < timeline.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    timeline[i] = timeline[i]! + ((seed / 0xffffffff) * 2 - 1) * 0.003;
  }

  const adapterModule =
    PIPELINE === "legacy"
      ? await import(pathToFileURL(path.join(root, ".bench", "legacy", "adapter.mts")).href)
      : await import("./live-pipeline-adapter.mts");
  const adapter: PipelineAdapter = adapterModule.createAdapter({ base: BASE, sampleRate: SAMPLE_RATE });

  type Req = { id: string; question: string; at: number; firstToken?: number; done?: number; answer?: string; outcome: string; error?: string };
  const requests: Req[] = [];
  const byId = new Map<string, Req>();
  const skips: { text: string; reason: string; at: number }[] = [];
  const transcribeMs: number[] = [];
  let transcribeFailures = 0;
  let t0 = 0;
  const rel = (at: number) => at - t0;

  await adapter.start({
    transcript: () => undefined,
    transcribeTiming: ({ ms, ok }) => {
      if (ok) transcribeMs.push(ms);
      else transcribeFailures += 1;
    },
    answerRequested: ({ id, question, at }) => {
      const r: Req = { id, question, at: rel(at), outcome: "pending" };
      requests.push(r);
      byId.set(id, r);
    },
    firstToken: ({ id, at }) => {
      const r = byId.get(id);
      if (r && r.firstToken == null) r.firstToken = rel(at);
    },
    answerComplete: ({ id, answer, at }) => {
      const r = byId.get(id);
      if (r) Object.assign(r, { done: rel(at), answer, outcome: "answered" });
    },
    answerAborted: ({ id }) => {
      const r = byId.get(id);
      if (r && r.outcome === "pending") r.outcome = "superseded";
    },
    answerFailed: ({ id, error }) => {
      const r = byId.get(id);
      if (r) Object.assign(r, { outcome: "failed", error });
    },
    skipped: ({ text, reason, at }) => skips.push({ text, reason, at: rel(at) }),
  });

  origLog(`[${LABEL}] streaming ${(timeline.length / SAMPLE_RATE).toFixed(1)}s of audio, ${steps.length} questions`);
  t0 = performance.now();
  for (let i = 0; i < timeline.length; i += CHUNK) {
    const due = t0 + (i / SAMPLE_RATE) * 1000;
    const wait = due - performance.now();
    if (wait > 1) await new Promise((r) => setTimeout(r, wait));
    adapter.push(timeline.subarray(i, Math.min(timeline.length, i + CHUNK)), performance.now());
  }
  const deadline = performance.now() + 30_000;
  while (!adapter.idle() && performance.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  await adapter.stop();
  console.log = origLog;

  // Attribute each answer request to the question being (or last) spoken.
  const stepFor = (at: number) => {
    let found: Step | undefined;
    for (const s of steps) if (s.startAt <= at) found = s;
    return found;
  };
  const rows = steps.map((s) => {
    const reqs = requests.filter((r) => stepFor(r.at) === s);
    const premature = reqs.filter((r) => r.at < s.lastVoiceAt);
    const main = reqs.find((r) => r.outcome === "answered") || reqs.at(-1);
    const rubric = RUBRIC[s.id];
    const relevant = main?.answer && rubric ? rubric.every((re) => re.test(main.answer!)) : null;
    return {
      id: s.id,
      expected: s.text,
      requests: reqs.length,
      premature: premature.length,
      outcome: main?.outcome || "missed",
      question: main?.question || "",
      wer: main ? Number(wer(s.text, main.question).toFixed(3)) : null,
      finalizeMs: main ? Math.round(main.at - s.lastVoiceAt) : null,
      firstTokenMs: main?.firstToken != null ? Math.round(main.firstToken - s.lastVoiceAt) : null,
      completeMs: main?.done != null ? Math.round(main.done - s.lastVoiceAt) : null,
      llmTtftMs: main?.firstToken != null ? Math.round(main.firstToken - main.at) : null,
      relevant,
      error: main?.error,
      answerWords: main?.answer ? words(main.answer).length : 0,
    };
  });

  const answeredRows = rows.filter((r) => r.outcome === "answered");
  const summary = {
    label: LABEL,
    pipeline: PIPELINE,
    at: new Date().toISOString(),
    questions: rows.length,
    triggered: rows.filter((r) => r.requests > 0).length,
    answered: answeredRows.length,
    missed: rows.filter((r) => r.requests === 0).length,
    duplicateRequests: rows.reduce((n, r) => n + Math.max(0, r.requests - 1), 0),
    prematureRequests: rows.reduce((n, r) => n + r.premature, 0),
    failed: rows.filter((r) => r.outcome === "failed").length,
    transcribeFailures,
    meanWer: Number(
      (rows.filter((r) => r.wer != null).reduce((a, r) => a + r.wer!, 0) /
        Math.max(1, rows.filter((r) => r.wer != null).length)).toFixed(3),
    ),
    relevantPass: `${answeredRows.filter((r) => r.relevant === true).length}/${answeredRows.filter((r) => r.relevant != null).length}`,
    lastWordToAnswerRequestMs: stats(rows.filter((r) => r.finalizeMs != null && r.premature === 0).map((r) => r.finalizeMs!)),
    lastWordToFirstTokenMs: stats(rows.filter((r) => r.firstTokenMs != null).map((r) => r.firstTokenMs!)),
    lastWordToCompleteMs: stats(rows.filter((r) => r.completeMs != null).map((r) => r.completeMs!)),
    requestToFirstTokenMs: stats(rows.filter((r) => r.llmTtftMs != null).map((r) => r.llmTtftMs!)),
    transcribeRequestMs: stats(transcribeMs),
    transcribeRequests: transcribeMs.length + transcribeFailures,
    skipped: skips.map((s) => `${s.reason}: ${s.text.slice(0, 60)}`),
  };

  for (const r of rows) {
    origLog(
      `${r.id.padEnd(16)} ${r.outcome.padEnd(10)} req=${r.requests} pre=${r.premature} wer=${r.wer ?? "-"} ` +
        `final=${r.finalizeMs ?? "-"}ms ttft=${r.firstTokenMs ?? "-"}ms done=${r.completeMs ?? "-"}ms ` +
        `rel=${r.relevant ?? "-"} | ${r.question.slice(0, 70)}${r.error ? ` | ERR ${r.error.slice(0, 80)}` : ""}`,
    );
  }
  origLog(JSON.stringify(summary, null, 2));
  const outDir = path.join(root, ".bench", "results");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${LABEL}.json`), JSON.stringify({ summary, rows, requests }, null, 2));
  origLog(`Wrote .bench/results/${LABEL}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
