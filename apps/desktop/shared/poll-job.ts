export type JobStatusPayload = {
  jobId?: string;
  status?: "queued" | "running" | "completed" | "failed";
  result?: {
    ok?: boolean;
    answer?: string;
    confidence?: number;
    model?: string;
    provider?: string;
  };
  error?: string;
};

export async function pollJobUntilDone(input: {
  apiBase: string;
  jobId: string;
  signal?: AbortSignal;
  initialDelayMs?: number;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<JobStatusPayload> {
  const base = input.apiBase.replace(/\/$/, "");
  const timeoutMs = input.timeoutMs ?? 120_000;
  const intervalMs = input.intervalMs ?? 400;
  const started = Date.now();

  await new Promise((r) => setTimeout(r, input.initialDelayMs ?? 300));

  while (Date.now() - started < timeoutMs) {
    if (input.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const res = await fetch(`${base}/api/jobs/${encodeURIComponent(input.jobId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: input.signal,
    });
    const data = (await res.json().catch(() => ({}))) as JobStatusPayload;
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Unable to load job status.",
      );
    }
    if (data.status === "completed") return data;
    if (data.status === "failed") {
      throw new Error(data.error || "Screen analysis failed");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Screen analysis timed out. Please try again.");
}
