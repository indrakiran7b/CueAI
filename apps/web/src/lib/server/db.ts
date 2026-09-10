import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceRole } from "@/lib/roles";
import type { OnboardingProfile } from "@/lib/onboarding";
import { hashPassword } from "@/lib/server/session";

export type UserStatus = "Active" | "Invited" | "Deactivated";

export type DbUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: WorkspaceRole;
  status: UserStatus;
  workspaceId: string;
  createdAt: string;
  lastActiveAt?: string;
  /** Post-signup questionnaire answers; absent until the user finishes onboarding. */
  onboarding?: OnboardingProfile;
};

export type DbInvite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string;
  /** Legacy field; unused in immediate-invite flow (kept for store compatibility). */
  token?: string;
  status: "sent" | "active" | "revoked" | "expired" | "pending" | "accepted";
  createdAt: string;
  expiresAt?: string;
  acceptedAt?: string;
  sentAt?: string;
  workspaceId?: string;
};

export type AiProviderType = "groq" | "openai" | "anthropic" | "gemini" | "custom";

export type DbAiProvider = {
  id: string;
  name: string;
  type: AiProviderType;
  enabled: boolean;
  endpoint: string;
  apiKeyEnc?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type DbAiModel = {
  id: string;
  name: string;
  providerId: string;
  capability: "chat" | "stt" | "embedding" | "other";
  enabled: boolean;
  isDefault: boolean;
  contextWindow?: number;
  updatedAt?: string;
};

export type DbAiConfig = {
  provider: AiProviderType;
  model: string;
  enabledProviders: AiProviderType[];
  enabledModels: string[];
  defaultModel: string;
  endpoint?: string;
  apiKeyEnc?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Structured provider catalog (preferred). */
  providers?: DbAiProvider[];
  /** Structured model catalog (preferred). */
  models?: DbAiModel[];
};

export type DbKnowledge = {
  id: string;
  workspaceId?: string;
  title: string;
  type: "pdf" | "docx" | "md" | "txt" | "url" | "note";
  status: "indexed" | "processing" | "failed";
  sizeLabel: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type DbUsageEvent = {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  type: "tokens" | "meeting_minutes" | "resume_rewrite";
  quantity: number;
  inputTokens?: number;
  outputTokens?: number;
  provider?: string;
  model?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
};

export type DbAudit = {
  id: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type DbWorkspace = {
  id: string;
  name: string;
  seats: number;
  createdAt?: string;
  privacy: {
    shareTranscriptsWithTeam: boolean;
    allowAiTrainingOptIn: boolean;
    redactPiiInExports: boolean;
    requireInviteForJoin: boolean;
  };
  retention: {
    meetingDays: number;
    transcriptDays: number;
    notesDays: number;
    resumeDays: number;
    knowledgeDays: number;
    autoDeleteEnabled: boolean;
  };
};

export type DbMeetingLine = { who: string; text: string; at?: string };

export type DbMeeting = {
  id: string;
  workspaceId: string;
  userId?: string;
  title: string;
  kind: "interview" | "regular";
  status: "live" | "summary";
  startedAt: string;
  endedAt?: string;
  durationSec: number;
  attendees: number;
  tags: string[];
  company?: string;
  jobDescription?: string;
  jobLink?: string;
  resumeName?: string;
  resumeText?: string;
  description?: string;
  transcript: DbMeetingLine[];
  answers: { prompt: string; answer: string; at: string }[];
  summary?: string;
};

export type WorkspaceStore = {
  workspace: DbWorkspace;
  users: DbUser[];
  invites: DbInvite[];
  knowledge: DbKnowledge[];
  usage: DbUsageEvent[];
  audit: DbAudit[];
  ai: DbAiConfig;
  meetings?: DbMeeting[];
  activeMeetingId?: string | null;
  /** Latest resume / job briefing for live answers, even before a meeting starts. */
  liveBriefing?: {
    kind?: "interview" | "regular";
    company?: string;
    jobDescription?: string;
    jobLink?: string;
    resumeName?: string;
    resumeText?: string;
    description?: string;
    updatedAt: string;
  } | null;
};

// Packaged desktop builds set CUEAI_DATA_DIR because their working directory
// is a throwaway extraction folder.
const DATA_DIR = process.env.CUEAI_DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "workspace-store.json");

function defaultStore(): WorkspaceStore {
  const workspaceId = "ws_default";
  const adminId = "usr_bootstrap_admin";
  return {
    workspace: {
      id: workspaceId,
      name: "CueAI Workspace",
      seats: 25,
      privacy: {
        shareTranscriptsWithTeam: false,
        allowAiTrainingOptIn: false,
        redactPiiInExports: true,
        requireInviteForJoin: true,
      },
      retention: {
        meetingDays: 365,
        transcriptDays: 365,
        notesDays: 365,
        resumeDays: 180,
        knowledgeDays: 730,
        autoDeleteEnabled: false,
      },
    },
    users: [
      {
        id: adminId,
        name: "Workspace Admin",
        email: "admin@cueai.local",
        passwordHash: hashPassword("admin123"),
        role: "Admin",
        status: "Active",
        workspaceId,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
    ],
    invites: [],
    knowledge: [],
    usage: [],
    audit: [],
    meetings: [],
    activeMeetingId: null,
    ai: {
      provider: "groq",
      model: "openai/gpt-oss-20b",
      enabledProviders: ["groq"],
      enabledModels: ["openai/gpt-oss-20b", "llama-3.3-70b-versatile", "whisper-large-v3"],
      defaultModel: "openai/gpt-oss-20b",
      endpoint: "https://api.groq.com/openai/v1",
      apiKeyEnc: "",
    },
  };
}

let memory: WorkspaceStore | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<WorkspaceStore> {
  if (memory) {
    const { ensureAiCatalog } = await import("@/lib/server/ai-config");
    ensureAiCatalog(memory.ai);
    return memory;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STORE_PATH, "utf8");
    memory = JSON.parse(raw) as WorkspaceStore;
    const { ensureAiCatalog } = await import("@/lib/server/ai-config");
    ensureAiCatalog(memory.ai);
    if (!memory.workspace.createdAt) {
      memory.workspace.createdAt = memory.users[0]?.createdAt || new Date().toISOString();
    }
    return memory;
  } catch {
    memory = defaultStore();
    const { ensureAiCatalog } = await import("@/lib/server/ai-config");
    ensureAiCatalog(memory.ai);
    memory.workspace.createdAt = new Date().toISOString();
    await persist(memory);
    return memory;
  }
}

async function persist(store: WorkspaceStore) {
  memory = store;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  });
  await writeQueue;
}

export async function readStore() {
  return ensureLoaded();
}

export async function updateStore(mutator: (store: WorkspaceStore) => void | Promise<void>) {
  const store = await ensureLoaded();
  await mutator(store);
  await persist(store);
  return store;
}

export async function appendAudit(
  store: WorkspaceStore,
  entry: Omit<DbAudit, "id" | "createdAt" | "workspaceId"> & { workspaceId?: string },
) {
  store.audit.unshift({
    id: `aud_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    workspaceId: entry.workspaceId || store.workspace.id,
    actorId: entry.actorId,
    actorName: entry.actorName,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: entry.metadata,
  });
  store.audit = store.audit.slice(0, 500);
}

export async function appendUsage(
  store: WorkspaceStore,
  entry: Omit<DbUsageEvent, "id" | "createdAt" | "workspaceId"> & { workspaceId?: string },
) {
  store.usage.unshift({
    id: `use_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    workspaceId: entry.workspaceId || store.workspace.id,
    userId: entry.userId,
    userName: entry.userName,
    type: entry.type,
    quantity: entry.quantity,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    provider: entry.provider,
    model: entry.model,
    metadata: entry.metadata,
  });
  store.usage = store.usage.slice(0, 2000);
}

export function publicUser(user: DbUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    workspaceId: user.workspaceId,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt || null,
    onboardingCompleted: Boolean(user.onboarding?.completedAt),
  };
}
