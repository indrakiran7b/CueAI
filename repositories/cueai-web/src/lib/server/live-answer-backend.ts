import { resolveGroqApiKey } from "@/lib/server/groq";

export function liveAnswerApiUrl(): string {
  return (process.env.CUEAI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

export function forceLiveAnswerLocal(): boolean {
  return process.env.CUEAI_LIVE_ANSWER_LOCAL === "1";
}

export function localProvidersConfigured(): { groq: boolean; gemini: boolean } {
  const groq = Boolean(resolveGroqApiKey());
  const gemini = Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.VERTEX_API_KEY?.trim(),
  );
  return { groq, gemini };
}

export type FastApiProbe = {
  reachable: boolean;
  status?: number;
  error?: string;
};

export async function probeFastApi(timeoutMs = 2500): Promise<FastApiProbe> {
  const base = liveAnswerApiUrl();
  try {
    const res = await fetch(`${base}/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { reachable: true, status: res.status };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return {
      reachable: false,
      error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable",
    };
  }
}

export async function proxyLiveAnswerToFastApi(input: {
  body: ArrayBuffer;
  contentType: string;
  accept: string;
  cookie: string;
  signal?: AbortSignal;
}): Promise<{ response: Response } | { error: "unreachable" | "timeout" }> {
  const base = liveAnswerApiUrl();
  try {
    const timeout = AbortSignal.timeout(12_000);
    const signal =
      input.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([input.signal, timeout])
        : timeout;
    const upstream = await fetch(`${base}/v1/live/answer`, {
      method: "POST",
      headers: {
        "content-type": input.contentType || "application/json",
        accept: input.accept || "*/*",
        cookie: input.cookie,
      },
      body: input.body,
      signal,
    });
    return { response: upstream };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      if (input.signal?.aborted) throw err;
      return { error: "timeout" };
    }
    return { error: "unreachable" };
  }
}

export function liveAnswerUnavailableMessage(reason: "unreachable" | "timeout" | "unconfigured"): string {
  const base = liveAnswerApiUrl();
  if (reason === "unconfigured") {
    return "AI provider is not configured. Add GROQ_API_KEY (and optional GEMINI_API_KEY) on the web or API server.";
  }
  if (reason === "timeout") {
    return `CueAI API timed out at ${base}. Retry the question, or start the API with: uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`;
  }
  return `CueAI API is not reachable at ${base}. Start repositories/cueai-api (uvicorn on that port) or set CUEAI_LIVE_ANSWER_LOCAL=1 so this web process answers with GROQ_API_KEY.`;
}
