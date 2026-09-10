import type { KnowledgeDoc } from "../data/mock";

/** Mock chunk store keyed by doc id — pretend embeddings. */
const CHUNK_BANK: Record<string, string[]> = {
  k1: [
    "CueAI Pro seats include Live overlay, Knowledge RAG, and Resume Tailor.",
    "Enterprise packaging adds SSO, SCIM, and admin usage dashboards.",
  ],
  k2: [
    "Presenter Privacy Mode hides CueAI from entire-screen share by removing the overlay from the display while sharing is active.",
    "Consent banners should be shown when transcription or AI assistance is enabled.",
  ],
  k3: [
    "CueAI mobile uses Capacitor with a native WindowManager overlay service on Android.",
    "Screen context OCR is processed preferentially on-device before cloud AI.",
  ],
  k4: [
    "Privacy docs: Screen Context is opt-in. Document ACLs apply to RAG answers.",
  ],
  k5: [
    "Q: What is Presenter Privacy Mode? A: It keeps the assistant out of screen share for other participants.",
  ],
};

export type RagHit = {
  docId: string;
  title: string;
  chunk: string;
  score: number;
};

export function mockRetrieve(query: string, docs: KnowledgeDoc[], topK = 3): RagHit[] {
  const q = query.toLowerCase();
  const terms = q.split(/\W+/).filter((t) => t.length > 2);
  const indexed = docs.filter((d) => d.status === "indexed");
  const hits: RagHit[] = [];

  for (const doc of indexed) {
    const chunks = CHUNK_BANK[doc.id] ?? [
      `${doc.title}: indexed snippet about ${doc.category.toLowerCase()} for CueAI workflows.`,
      `${doc.title}: additional context for RAG retrieval demos.`,
    ];
    for (const chunk of chunks) {
      const lower = chunk.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (lower.includes(t)) score += 1;
        if (doc.title.toLowerCase().includes(t)) score += 0.5;
        if (doc.category.toLowerCase().includes(t)) score += 0.25;
      }
      if (score === 0 && (q.includes("privacy") || q.includes("presenter")) && lower.includes("privacy")) {
        score = 2;
      }
      if (score > 0) hits.push({ docId: doc.id, title: doc.title, chunk, score });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, topK);
  if (top.length) return top;

  // Fallback: return first chunks from indexed docs so RAG always demos
  return indexed.slice(0, topK).map((doc, i) => ({
    docId: doc.id,
    title: doc.title,
    chunk: (CHUNK_BANK[doc.id] ?? [`${doc.title} placeholder chunk`])[0],
    score: 0.1 * (topK - i),
  }));
}

export function formatRagAnswer(query: string, hits: RagHit[]): string {
  if (!hits.length) {
    return `No indexed documents yet for “${query}”. Upload or re-index sources first.`;
  }
  const cites = hits.map((h) => h.title).join(" · ");
  const body = hits.map((h, i) => `[${i + 1}] ${h.chunk}`).join("\n\n");
  return `Knowledge-backed answer for “${query}”\n\nCited: ${cites}\n\n${body}\n\n(Mock RAG — cosine scores simulated from keyword overlap.)`;
}
