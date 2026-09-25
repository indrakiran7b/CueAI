/**
 * Screen Context client — calls the web API that reuses Resume Analyzer AI keys.
 * Never holds API keys in the renderer.
 */

import { createLatencyTracker, pipelineLog } from "./pipeline-log";

export type ScreenContextAnswer = {
  answer: string;
  confidence: number;
  model: string;
  provider: string;
};

let apiBase = "http://127.0.0.1:3000";

export function configureScreenContextApi(base: string) {
  if (base) apiBase = base.replace(/\/$/, "");
}

export class ScreenContextUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenContextUnavailable";
  }
}

const DEFAULT_PROMPT =
  "Analyze the screenshot and identify the question or task the user is asking. Answer the visible question directly and accurately. If there is code, analyze the code. If it is a multiple-choice question, provide the correct option and a brief explanation. Ignore unrelated UI elements and the CueAI overlay. If text is cut off or unreadable, say so — do not invent missing content.";

export async function requestScreenContext(input: {
  imageDataUrl: string;
  prompt?: string;
  recentContext?: string;
  signal?: AbortSignal;
  onProgress?: (stage: string) => void;
}): Promise<ScreenContextAnswer> {
  const latency = createLatencyTracker("screen_context");
  latency.mark("aiRequest");
  pipelineLog("overlay", "[SCREEN-AI] Vision request sent", {
    chars: input.imageDataUrl.length,
  });
  input.onProgress?.("sending");

  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/live/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: input.signal,
      body: JSON.stringify({
        image: input.imageDataUrl,
        prompt: input.prompt || DEFAULT_PROMPT,
        recentContext: input.recentContext || "",
      }),
    });
  } catch (err) {
    if (input.signal?.aborted) throw err;
    throw new ScreenContextUnavailable("CueAI server unreachable. Is the web app running?");
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    answer?: string;
    confidence?: number;
    model?: string;
    provider?: string;
    error?: string;
  };

  if (!res.ok || !data.answer?.trim()) {
    throw new ScreenContextUnavailable(
      data.error || "Unable to analyze the screen. Please try again.",
    );
  }

  latency.mark("firstToken");
  latency.mark("answerVisible");
  latency.report("screen_context");
  pipelineLog("overlay", "[SCREEN-AI] First response received", {
    provider: data.provider || "gemini",
    chars: data.answer.length,
  });

  return {
    answer: data.answer.trim(),
    confidence: typeof data.confidence === "number" ? data.confidence : 0.75,
    model: data.model || "gemini",
    provider: data.provider || "gemini",
  };
}
