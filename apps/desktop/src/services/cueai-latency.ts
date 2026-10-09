/**
 * High-resolution speech→answer timing. Never logs keys, questions, or answers.
 */

export type CueaiLatencyMarks = {
  speechStart?: number;
  speechDetected?: number;
  speechEnded?: number;
  transcriptionStarted?: number;
  transcriptionReceived?: number;
  questionSent?: number;
  llmConnected?: number;
  firstToken?: number;
  firstRender?: number;
  complete?: number;
};

export type CueaiLatencySample = {
  vadMs: number;
  whisperMs: number;
  apiMs: number;
  llmTtftMs: number;
  uiMs: number;
  totalMs: number;
};

const samples: CueaiLatencySample[] = [];
const MAX_SAMPLES = 20;

function delta(from?: number, to?: number) {
  if (from == null || to == null) return 0;
  return Math.max(0, Math.round(to - from));
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export function createCueaiLatency(questionId = "00") {
  const marks: CueaiLatencyMarks = {};

  function mark(key: keyof CueaiLatencyMarks, at = performance.now()) {
    if (marks[key] == null) marks[key] = at;
  }

  function report(platform = guessPlatform()) {
    const vadMs = delta(marks.speechEnded, marks.transcriptionStarted) || delta(marks.speechDetected, marks.speechEnded);
    const whisperMs = delta(marks.transcriptionStarted, marks.transcriptionReceived);
    const apiMs = delta(marks.questionSent, marks.llmConnected);
    const llmTtftMs = delta(marks.llmConnected || marks.questionSent, marks.firstToken);
    const uiMs = delta(marks.firstToken, marks.firstRender);
    const totalMs = delta(marks.speechEnded, marks.firstRender || marks.firstToken);

    const sample: CueaiLatencySample = { vadMs, whisperMs, apiMs, llmTtftMs, uiMs, totalMs };
    samples.push(sample);
    while (samples.length > MAX_SAMPLES) samples.shift();

    console.log("[CueAI Latency]");
    console.log(`Speech detection: ${vadMs}ms`);
    console.log(`Transcription: ${whisperMs}ms`);
    console.log(`API: ${apiMs}ms`);
    console.log(`LLM TTFT: ${llmTtftMs}ms`);
    console.log(`UI first render: ${uiMs}ms`);
    console.log(`TOTAL: ${(totalMs / 1000).toFixed(3)}s`);

    console.log("[CueAI Performance]");
    console.log(`Platform: ${platform}`);
    console.log(`Question ID: ${questionId}`);
    console.log("");
    console.log(`VAD: ${vadMs}ms`);
    console.log(`Whisper: ${whisperMs}ms`);
    console.log(`API: ${apiMs}ms`);
    console.log(`LLM TTFT: ${llmTtftMs}ms`);
    console.log(`UI: ${uiMs}ms`);
    console.log("");
    console.log(`TOTAL FIRST ANSWER: ${(totalMs / 1000).toFixed(3)}s`);
    console.log("[CueAI Capture]");
    console.log(`llm_first_token: ${llmTtftMs}ms`);
    console.log(`first_render: ${uiMs}ms`);
    console.log(`answer_complete: ${delta(marks.firstToken, marks.complete)}ms`);

    if (samples.length >= 2) {
      const totals = samples.map((s) => s.totalMs);
      console.log(`P50: ${(percentile(totals, 50) / 1000).toFixed(3)}s`);
      console.log(`P90: ${(percentile(totals, 90) / 1000).toFixed(3)}s`);
      console.log(`MAX: ${(Math.max(...totals) / 1000).toFixed(3)}s`);
    }

    return sample;
  }

  return { marks, mark, report };
}

export function getCueaiLatencySamples() {
  return samples.slice();
}

function guessPlatform() {
  if (typeof navigator === "undefined") return "unknown";
  if (/Mac/i.test(navigator.platform) || /Mac OS/i.test(navigator.userAgent)) return "macOS";
  if (/Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent)) return "Windows";
  return navigator.platform || "unknown";
}
