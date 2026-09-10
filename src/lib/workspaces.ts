export type Workspace = {
  id: string;
  name: string;
  role: "Admin" | "Member" | "Viewer";
  members: number;
};

const KEY = "cueai.workspaces.v1";
const ACTIVE_KEY = "cueai.workspaces.active";

const seed: Workspace[] = [
  { id: "w1", name: "CueAI Product", role: "Admin", members: 12 },
  { id: "w2", name: "Customer Success", role: "Member", members: 8 },
];

export function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as Workspace[];
    return parsed.length ? parsed : seed;
  } catch {
    return seed;
  }
}

export function saveWorkspaces(list: Workspace[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function loadActiveWorkspaceId(list: Workspace[]) {
  return localStorage.getItem(ACTIVE_KEY) || list[0]?.id || "w1";
}

export function saveActiveWorkspaceId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export type AiProviderId = "mock" | "grok" | "openai";

const AI_KEY = "cueai.ai-provider";

export function loadAiProvider(): AiProviderId {
  const v = localStorage.getItem(AI_KEY);
  if (v === "grok" || v === "openai" || v === "mock") return v;
  return "mock";
}

export function saveAiProvider(id: AiProviderId) {
  localStorage.setItem(AI_KEY, id);
}

export function aiProviderDisplay(id: AiProviderId) {
  switch (id) {
    case "grok":
      return "Grok (mock routed)";
    case "openai":
      return "OpenAI (mock routed)";
    default:
      return "On-device mock";
  }
}
