/**
 * Structured latency / pipeline logs for the live overlay.
 * Never log API keys, raw audio, or full answer text.
 */

export type LatencyMarks = {
  speechStart?: number;
  audioEnd?: number;
  transcriptionFinal?: number;
  questionDetected?: number;
  aiRequest?: number;
  firstToken?: number;
  answerVisible?: number;
};

const PREFIX: Record<string, string> = {
  audio: "[AUDIO]",
  transcription: "[TRANSCRIPTION]",
  question: "[QUESTION DETECTION]",
  ai: "[AI REQUEST]",
  response: "[AI RESPONSE]",
  fallback: "[FALLBACK]",
  overlay: "[OVERLAY]",
  perf: "[PERF]",
};

function ms(from?: number, to?: number) {
  if (from == null || to == null) return undefined;
  return Math.round(to - from);
}

export function pipelineLog(
  area: keyof typeof PREFIX,
  message: string,
  detail?: Record<string, string | number | boolean | null | undefined>,
) {
  const tag = PREFIX[area] || "[OVERLAY]";
  if (detail && Object.keys(detail).length) {
    console.log(tag, message, detail);
  } else {
    console.log(tag, message);
  }
}

export function createLatencyTracker(label: string) {
  const marks: LatencyMarks = {};
  const t0 = performance.now();

  function mark(key: keyof LatencyMarks, at = performance.now()) {
    if (marks[key] == null) marks[key] = at;
  }

  function report(stage = "pipeline") {
    const speechEnd = marks.audioEnd ?? marks.questionDetected ?? t0;
    const abs = (v?: number) =>
      v == null ? undefined : Number(((v - speechEnd) / 1000).toFixed(3));

    console.log("[PERF] Speech ended:", `${(0).toFixed(3)}s`);
    if (marks.transcriptionFinal != null) {
      console.log("[PERF] Transcript finalized:", `${abs(marks.transcriptionFinal)}s`);
    }
    if (marks.questionDetected != null) {
      console.log("[PERF] Question finalized:", `${abs(marks.questionDetected)}s`);
    }
    if (marks.aiRequest != null) {
      console.log("[PERF] AI request started:", `${abs(marks.aiRequest)}s`);
    }
    if (marks.firstToken != null) {
      console.log("[PERF] First token:", `${abs(marks.firstToken)}s`);
    }
    if (marks.answerVisible != null) {
      console.log("[PERF] Answer visible:", `${abs(marks.answerVisible)}s`);
    }

    const total = ms(speechEnd, marks.answerVisible ?? marks.firstToken);
    console.log(
      "[PERF] TOTAL RESPONSE LATENCY:",
      total != null ? `${(total / 1000).toFixed(2)}s` : "n/a",
      {
        stage,
        label: label.slice(0, 60),
        speech_end_to_transcript_ms: ms(marks.audioEnd, marks.transcriptionFinal),
        transcript_to_question_ms: ms(marks.transcriptionFinal, marks.questionDetected),
        question_to_ai_ms: ms(marks.questionDetected, marks.aiRequest),
        ai_to_first_token_ms: ms(marks.aiRequest, marks.firstToken),
        first_token_to_visible_ms: ms(marks.firstToken, marks.answerVisible),
        speech_end_to_visible_ms: total,
      },
    );
  }

  return { marks, mark, report };
}

/** Fire-and-forget warm-up so the first live answer reuses a hot HTTP path. */
export function prewarmAnswerApi(apiBase: string) {
  const base = apiBase.replace(/\/$/, "");
  if (!base) return;
  void fetch(`${base}/api/live/briefing`, { cache: "no-store" }).catch(() => undefined);
}
