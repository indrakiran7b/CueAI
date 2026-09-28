export function logRag(event: string, data: Record<string, unknown> = {}) {
  const safe = { ...data };
  for (const key of Object.keys(safe)) {
    if (/key|token|secret|authorization|password/i.test(key)) delete safe[key];
  }
  console.info(`[rag] ${event}`, safe);
}
