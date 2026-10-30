import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceRole } from "@/lib/roles";
import type { OnboardingProfile } from "@/lib/onboarding";
import type { ProfessionalProfile } from "@/lib/professional-profile";
import type { PalettePreference } from "@/lib/themes";
import type {
  MockInterviewStatus,
  MockReport,
  MockResumeProfile,
  MockSetup,
  MockTurn,
} from "@/lib/mock-interview-types";
import { hashPassword, verifyPassword } from "@/lib/server/session";
import {
  DEV_ONLY_BOOTSTRAP_EMAIL,
  DEV_ONLY_BOOTSTRAP_PASSWORD,
  resolveBootstrapAdmin,
} from "@/lib/server/bootstrap-admin";
import { isCueaiProduction } from "@/lib/runtime-env";

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
  /** Settings → Profile professional details; absent until the user saves them. */
  professionalProfile?: ProfessionalProfile;
  /** Settings → Appearance colour palette; absent until the user picks one. */
  appearance?: { palette: PalettePreference; updatedAt: string };
  /** Optional billing entitlement. Absent means free. */
  plan?: "free" | "premium";
  /** Stripe Customer id (cus_…). Never expose secret keys. */
  stripeCustomerId?: string;
  /** Active Stripe Subscription id (sub_…). */
  stripeSubscriptionId?: string;
  /** Stripe Price id currently attached. */
  stripePriceId?: string;
  /** Mapped CueAI plan key: free | pro | team | enterprise */
  billingPlanId?: string;
  /** Stripe-like status: active | trialing | past_due | canceled | unpaid | incomplete | incomplete_expired */
  billingStatus?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  /** Keygate license id created after successful payment (if Keygate admin mint succeeded). */
  keygateLicenseId?: string;
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

export type AiProviderType =
  | "groq"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "deepseek"
  | "perplexity"
  | "custom";

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

export type DbKnowledgeChunk = {
  id: string;
  index: number;
  text: string;
  tokenCount?: number;
  pageNumber?: number;
  sectionTitle?: string;
  vectorId?: string;
};

export type DbKnowledge = {
  id: string;
  workspaceId?: string;
  /** When set, document is Meeting Knowledge for that meeting only. */
  meetingId?: string | null;
  /** Explicit scope; derived from meetingId when omitted. */
  knowledgeScope?: "meeting" | "workspace";
  /** Workspace folder category (not used for "All" filter). */
  category?: "security" | "gtm" | "engineering" | "sales";
  title: string;
  type: "pdf" | "docx" | "md" | "txt" | "url" | "note" | "csv";
  status: "uploaded" | "processing" | "indexed" | "failed" | "deleting";
  sizeLabel: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  originalFilename?: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string;
  checksum?: string;
  chunkCount?: number;
  pageCount?: number;
  chunks?: DbKnowledgeChunk[];
  /** Embedding generation status for this document. */
  embeddingStatus?: "pending" | "ready" | "failed" | "skipped";
  /** True when chunk vectors were upserted to Qdrant. */
  vectorIndexed?: boolean;
  processingError?: string;
  processedAt?: string;
  documentVersion?: number;
};

export type ApiCredentialCapability = "rag" | "live_session" | "general_ai";

export type ApiCredentialStatus =
  | "connected"
  | "invalid"
  | "error"
  | "not_tested";

/** User-owned BYOK credential (encrypted at rest). Never return decrypted key to clients. */
export type DbUserApiCredential = {
  id: string;
  workspaceId: string;
  userId: string;
  /** User-facing label, e.g. "My OpenAI Key". */
  name: string;
  provider: AiProviderType;
  model: string;
  encryptedApiKey: string;
  keyLast4: string;
  status: ApiCredentialStatus;
  capabilities: ApiCredentialCapability[];
  /** Optional override base URL (OpenAI-compatible providers). */
  endpoint?: string;
  /** Optional OpenAI organization id. */
  organizationId?: string;
  /** Default/active for its capabilities within this user+workspace. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
  lastUsedAt?: string;
  lastError?: string;
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

export type DbMeetingLine = {
  who: string;
  text: string;
  at?: string;
  source?: "system" | "microphone" | "screen" | "user" | "cueai";
};

export type DbMeetingAnswer = {
  prompt: string;
  answer: string;
  at: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  source?: "auto" | "manual" | "screen";
  status?: "ok" | "failed";
  questionWho?: string;
};

export type DeviceStatus = "NEW" | "PENDING" | "ACTIVE" | "BLOCKED" | "REVOKED";

export type DbDevice = {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  status: Exclude<DeviceStatus, "NEW">;
  registeredAt: string;
  lastVerifiedAt?: string;
  updatedAt?: string;
  revokedAt?: string;
  blockedAt?: string;
  /** SHA-256 of the one-time device credential. Never store the plaintext. */
  credentialHash?: string;
};

export type DbMeeting = {
  id: string;
  workspaceId: string;
  userId?: string;
  title: string;
  kind: "interview" | "regular" | "mock_interview";
  /**
   * live = active session (hidden from history). completed/summary = history. incomplete = interrupted.
   * Mock interviews are never "live": incomplete while in progress, completed once finished.
   */
  status: "live" | "summary" | "completed" | "incomplete";
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
  /**
   * Workspace knowledge document ids attached to this meeting (reusable docs).
   * Meeting-scoped uploads are linked via KnowledgeDocument.meetingId.
   */
  documentIds?: string[];
  transcript: DbMeetingLine[];
  answers: DbMeetingAnswer[];
  summary?: string;
  /** Idempotency key from the client so retried create requests don't duplicate a session. */
  clientRequestId?: string;
  /** Present only when kind === "mock_interview". */
  mock?: DbMockInterviewData;
};

export type DbMockInterviewData = {
  status: MockInterviewStatus;
  setup: MockSetup;
  profile: MockResumeProfile;
  /** Private to the owner; used only to generate questions. Never returned to clients. */
  resumeText: string;
  welcome: string;
  turns: MockTurn[];
  questionLimit: number;
  endsAt: string;
  updatedAt: string;
  report?: MockReport;
  reportError?: string;
};

export type DbResumeAnalysis = {
  id: string;
  userId: string;
  workspaceId: string;
  status: "completed" | "tailored" | "failed" | "insufficient_job_description";
  /** SHA-256 of the extracted resume text and of the trimmed job description. */
  resumeHash: string;
  jdHash: string;
  scoringVersion: string;
  score: number | null;
  keywordAlignment: number | null;
  skillsMatch: number | null;
  matched: string[];
  partial: string[];
  missing: string[];
  recommendations: string[];
  tailoredScore?: number | null;
  tailoredHash?: string;
  tailoredAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceStore = {
  workspace: DbWorkspace;
  users: DbUser[];
  invites: DbInvite[];
  knowledge: DbKnowledge[];
  usage: DbUsageEvent[];
  audit: DbAudit[];
  ai: DbAiConfig;
  /** User BYOK credentials (encrypted). Scoped by userId + workspaceId. */
  userApiCredentials?: DbUserApiCredential[];
  meetings?: DbMeeting[];
  /** Legacy standalone mock interviews; migrated into meetings on load. */
  mockInterviews?: unknown[];
  /** Resume Tailor analysis results (scores and requirement names only; no resume text). */
  resumeAnalyses?: DbResumeAnalysis[];
  devices?: DbDevice[];
  activeMeetingId?: string | null;
  /**
   * Legacy global briefing. Never read for authenticated live/desktop requests.
   * New writes go to liveBriefings keyed by workspaceId:userId.
   */
  liveBriefing?: {
    kind?: "interview" | "regular";
    company?: string;
    jobDescription?: string;
    jobLink?: string;
    resumeName?: string;
    resumeText?: string;
    description?: string;
    /** Meeting-scoped docs uploaded during prep (assigned meetingId on create). */
    pendingKnowledgeIds?: string[];
    /** Workspace docs to attach when the live meeting starts. */
    documentIds?: string[];
    updatedAt: string;
  } | null;
  /** Per-user live briefing. Key: `${workspaceId}:${userId}`. */
  liveBriefings?: Record<
    string,
    {
      kind?: "interview" | "regular";
      company?: string;
      jobDescription?: string;
      jobLink?: string;
      resumeName?: string;
      resumeText?: string;
      description?: string;
      pendingKnowledgeIds?: string[];
      documentIds?: string[];
      updatedAt: string;
    }
  >;
};

// Packaged desktop builds set CUEAI_DATA_DIR because their working directory
// is a throwaway extraction folder.
const DATA_DIR = process.env.CUEAI_DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "workspace-store.json");

function defaultUsers(workspaceId: string): DbUser[] {
  const bootstrap = resolveBootstrapAdmin();
  if (!bootstrap) return [];
  return [
    {
      id: "usr_bootstrap_admin",
      name: bootstrap.name,
      email: bootstrap.email,
      passwordHash: hashPassword(bootstrap.password),
      role: "Admin",
      status: "Active",
      workspaceId,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    },
  ];
}

function assertNoDefaultBootstrapInProduction(store: WorkspaceStore) {
  if (!isCueaiProduction()) return;
  const seeded = store.users.find(
    (u) => u.email === DEV_ONLY_BOOTSTRAP_EMAIL && u.passwordHash,
  );
  if (seeded && verifyPassword(DEV_ONLY_BOOTSTRAP_PASSWORD, seeded.passwordHash)) {
    throw new Error(
      "Production cannot start with the default development bootstrap credentials. Change or remove that admin account.",
    );
  }
}

function defaultStore(): WorkspaceStore {
  const workspaceId = "ws_default";
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
    users: defaultUsers(workspaceId),
    invites: [],
    knowledge: [],
    usage: [],
    audit: [],
    meetings: [],
    devices: [],
    activeMeetingId: null,
    userApiCredentials: [],
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
let loadedMtimeMs = 0;

async function storeFileMtime(): Promise<number> {
  try {
    const st = await fs.stat(STORE_PATH);
    return st.mtimeMs;
  } catch {
    return 0;
  }
}

type LegacyMockInterview = {
  id: string;
  workspaceId: string;
  userId: string;
  status: MockInterviewStatus;
  setup: { jobTitle: string; jobDescription?: string; experienceLevel?: string; durationMin: 10 | 20 | 30; interviewType?: string; resumeName?: string };
  profile: MockResumeProfile;
  resumeText: string;
  welcome: string;
  turns: MockTurn[];
  questionLimit: number;
  startedAt: string;
  endsAt: string;
  endedAt?: string;
  updatedAt: string;
  report?: Omit<Partial<MockReport>, "improvements"> & { improvements?: { area: string; whyItMatters?: string; howToImprove?: string; exampleAnswer?: string }[] };
  reportError?: string;
};

/** Move standalone mock interviews (earlier layout) into meeting records; idempotent. */
function migrateLegacyMockInterviews(store: WorkspaceStore) {
  const legacy = (store.mockInterviews || []) as LegacyMockInterview[];
  if (!legacy.length) return;
  store.meetings = store.meetings || [];
  for (const m of legacy) {
    if (store.meetings.some((x) => x.id === m.id)) continue;
    const type = m.setup.interviewType === "hr" || m.setup.interviewType === "behavioral" ? "hr_behavioral" : m.setup.interviewType;
    const difficulty = m.setup.experienceLevel === "fresher" ? "beginner" : m.setup.experienceLevel === "experienced" ? "advanced" : "intermediate";
    const score = m.report?.overallScore;
    const report: MockReport | undefined =
      m.report && typeof score === "number"
        ? {
            overallScore: score,
            assessmentLabel: m.report.assessmentLabel || "AI practice assessment — not an official evaluation",
            readiness: score >= 80 ? "ready" : score >= 60 ? "nearly_ready" : score >= 40 ? "needs_practice" : "not_ready",
            readinessNote: "",
            summary: m.report.summary || "",
            categories: m.report.categories || [],
            strengths: m.report.strengths || [],
            improvements: (m.report.improvements || []).map((i) => ({
              area: i.area,
              whyItMatters: i.whyItMatters || "",
              whatToPractice: i.howToImprove || "",
              exercise: "",
              nextSteps: "",
            })),
            practicePlan: m.report.practicePlan || [],
            practiceQuestions: [],
            questionFeedback: [],
            generatedAt: m.report.generatedAt || m.updatedAt,
            provider: m.report.provider || "",
            model: m.report.model || "",
          }
        : undefined;
    const ended = m.endedAt || (m.status !== "active" ? m.updatedAt : undefined);
    store.meetings.unshift({
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      title: `Mock Interview · ${m.setup.jobTitle}`,
      kind: "mock_interview",
      status: report || m.status === "completed" ? "completed" : "incomplete",
      startedAt: m.startedAt,
      endedAt: ended,
      durationSec: ended ? Math.max(0, Math.round((Date.parse(ended) - Date.parse(m.startedAt)) / 1000)) : 0,
      attendees: 1,
      tags: ["Mock Interview"],
      resumeName: m.setup.resumeName,
      transcript: [],
      answers: [],
      summary: report?.summary,
      mock: {
        status: m.status,
        setup: {
          jobTitle: m.setup.jobTitle,
          jobDescription: m.setup.jobDescription,
          difficulty,
          durationMin: m.setup.durationMin,
          interviewType: (["technical", "hr_behavioral", "coding", "project", "mixed"].includes(type || "") ? type : "mixed") as MockSetup["interviewType"],
          resumeName: m.setup.resumeName,
        },
        profile: m.profile,
        resumeText: m.resumeText,
        welcome: m.welcome,
        turns: m.turns,
        questionLimit: m.questionLimit,
        endsAt: m.endsAt,
        updatedAt: m.updatedAt,
        report,
        reportError: m.reportError,
      },
    });
  }
  delete store.mockInterviews;
}

async function ensureLoaded(): Promise<WorkspaceStore> {
  const mtime = await storeFileMtime();
  if (memory && mtime && loadedMtimeMs && mtime <= loadedMtimeMs) {
    const { ensureAiCatalog } = await import("@/lib/server/ai-config");
    ensureAiCatalog(memory.ai);
    if (!memory.userApiCredentials) memory.userApiCredentials = [];
    return memory;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  let parsed: WorkspaceStore | null;
  try {
    parsed = await readStoreFile();
  } catch (err) {
    // The file exists but could not be read or parsed. Never replace it with an empty default:
    // that would erase every user, device and meeting.
    if (memory) {
      console.error("[DB] store read failed; serving cached copy", err instanceof Error ? err.message : err);
      return memory;
    }
    throw new Error(`Workspace store at ${STORE_PATH} is unreadable; refusing to overwrite it.`);
  }
  if (parsed) {
    memory = parsed;
    loadedMtimeMs = mtime || Date.now();
    const { ensureAiCatalog } = await import("@/lib/server/ai-config");
    ensureAiCatalog(memory.ai);
    if (!memory.userApiCredentials) memory.userApiCredentials = [];
    if (!memory.workspace.createdAt) {
      memory.workspace.createdAt = memory.users[0]?.createdAt || new Date().toISOString();
    }
    if (!memory.devices) memory.devices = [];
    for (const device of memory.devices) {
      if (!device.updatedAt) device.updatedAt = device.lastVerifiedAt || device.registeredAt;
    }
    migrateLegacyMockInterviews(memory);
    assertNoDefaultBootstrapInProduction(memory);
    return memory;
  }

  memory = defaultStore();
  const { ensureAiCatalog } = await import("@/lib/server/ai-config");
  ensureAiCatalog(memory.ai);
  memory.workspace.createdAt = new Date().toISOString();
  assertNoDefaultBootstrapInProduction(memory);
  await persist(memory);
  loadedMtimeMs = await storeFileMtime();
  return memory;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT_FS_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

/** Returns null only when the file does not exist; retries transient read/parse failures. */
async function readStoreFile(): Promise<WorkspaceStore | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const raw = await fs.readFile(STORE_PATH, "utf8");
      return JSON.parse(raw) as WorkspaceStore;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (attempt >= 5) throw err;
      await sleep(40 * (attempt + 1));
    }
  }
}

/** Write to a temp file and rename so readers never see a half-written store. */
async function writeStoreFileAtomic(contents: string) {
  const tmp = `${STORE_PATH}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await fs.writeFile(tmp, contents, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, STORE_PATH);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code || "";
      if (!TRANSIENT_FS_CODES.has(code) || attempt >= 8) {
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
      await sleep(25 * (attempt + 1));
    }
  }
}

async function persist(store: WorkspaceStore) {
  memory = store;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await writeStoreFileAtomic(JSON.stringify(store, null, 2));
    loadedMtimeMs = await storeFileMtime();
  });
  await writeQueue;
}

export async function readStore() {
  return ensureLoaded();
}

/** Drop in-memory cache so the next read picks up disk changes (e.g. purge). */
export function invalidateStoreCache() {
  memory = null;
  loadedMtimeMs = 0;
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
    plan: user.plan === "premium" ? "premium" : "free",
    billingPlanId: user.billingPlanId || (user.plan === "premium" ? "pro" : "free"),
    billingStatus: user.billingStatus || (user.plan === "premium" ? "active" : "none"),
    billingPeriodEnd: user.billingPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(user.cancelAtPeriodEnd),
  };
}
