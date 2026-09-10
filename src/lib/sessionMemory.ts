/** Local meeting context memory (mock — no backend). */

export type MemoryFact = {
  id: string;
  at: number;
  kind: "transcript" | "decision" | "ask" | "ocr" | "note";
  text: string;
};

export type MeetingMemory = {
  sessionId: string;
  host: string;
  startedAt: number;
  facts: MemoryFact[];
};

const KEY = "cueai.meeting-memory.v1";

function loadAll(): MeetingMemory[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MeetingMemory[];
  } catch {
    return [];
  }
}

function saveAll(list: MeetingMemory[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
}

export function startMeetingMemory(host: string): MeetingMemory {
  const session: MeetingMemory = {
    sessionId: `s-${Date.now()}`,
    host,
    startedAt: Date.now(),
    facts: [
      {
        id: `f-${Date.now()}`,
        at: Date.now(),
        kind: "note",
        text: `Session started over ${hostLabel(host)}. Consent banner assumed on.`,
      },
    ],
  };
  const all = loadAll().filter((s) => s.sessionId !== session.sessionId);
  saveAll([session, ...all]);
  return session;
}

export function appendMemory(sessionId: string, kind: MemoryFact["kind"], text: string) {
  const all = loadAll();
  const idx = all.findIndex((s) => s.sessionId === sessionId);
  if (idx < 0) return;
  const fact: MemoryFact = { id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), kind, text };
  all[idx] = { ...all[idx], facts: [...all[idx].facts, fact].slice(-40) };
  saveAll(all);
  return all[idx];
}

export function getMemory(sessionId: string) {
  return loadAll().find((s) => s.sessionId === sessionId) ?? null;
}

export function listMemories() {
  return loadAll();
}

export function memorySummary(sessionId: string): string {
  const m = getMemory(sessionId);
  if (!m) return "No meeting memory yet.";
  const decisions = m.facts.filter((f) => f.kind === "decision").map((f) => f.text);
  const asks = m.facts.filter((f) => f.kind === "ask").slice(-3).map((f) => f.text);
  const ocr = m.facts.filter((f) => f.kind === "ocr").slice(-1).map((f) => f.text);
  const lines = [
    `Host: ${hostLabel(m.host)}`,
    `Facts captured: ${m.facts.length}`,
    decisions.length ? `Decisions:\n${decisions.map((d) => `• ${d}`).join("\n")}` : "Decisions: none yet",
    asks.length ? `Recent asks:\n${asks.map((a) => `• ${a}`).join("\n")}` : "",
    ocr.length ? `Latest screen OCR:\n${ocr[0]}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function hostLabel(host: string) {
  if (host === "zoom") return "Zoom";
  if (host === "teams") return "Teams";
  return "Google Meet";
}
