const QWEN_VL_URL = (process.env.CUEAI_QWEN_VL_URL || "http://127.0.0.1:39292").replace(/\/$/, "");

export type QwenVisionAnswer = {
  answer: string;
  confidence: number;
  model: string;
  provider: "qwen";
};

export async function getQwenVisionStatus(): Promise<{
  ready: boolean;
  loading: boolean;
  downloaded: boolean;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string | null;
} | null> {
  try {
    const res = await fetch(`${QWEN_VL_URL}/status`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as {
      ready: boolean;
      loading: boolean;
      downloaded: boolean;
      downloadedBytes?: number;
      totalBytes?: number;
      error?: string | null;
    };
  } catch {
    return null;
  }
}

export async function analyzeScreenWithQwen(input: {
  image: string;
  prompt: string;
  sessionContext?: string;
}): Promise<QwenVisionAnswer | null> {
  const status = await getQwenVisionStatus();
  if (!status) return null;
  if (status.loading && !status.ready) {
    throw new Error("Qwen2.5-VL is still loading. Wait a few seconds and press Screen again.");
  }
  if (!status.downloaded && !status.ready) {
    const have = status.downloadedBytes || 0;
    const need = status.totalBytes || 0;
    const pct = need > 0 ? Math.max(1, Math.round((have / need) * 100)) : 0;
    throw new Error(
      pct
        ? `Qwen2.5-VL is still downloading (${pct}%). Keep the vision server running, then press Screen again.`
        : "Qwen2.5-VL is still downloading. Keep the vision server running, then press Screen again.",
    );
  }

  const res = await fetch(`${QWEN_VL_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(110_000),
    body: JSON.stringify({
      image: input.image,
      prompt: input.prompt,
      sessionContext: input.sessionContext || "",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    answer?: string;
    confidence?: number;
    model?: string;
    error?: string;
  };
  if (!res.ok || !data.answer) {
    throw new Error(data.error || "Qwen2.5-VL could not read that screen.");
  }
  return {
    answer: data.answer.trim(),
    confidence: typeof data.confidence === "number" ? data.confidence : 0.78,
    model: data.model || "Qwen/Qwen2.5-VL-3B-Instruct",
    provider: "qwen",
  };
}
