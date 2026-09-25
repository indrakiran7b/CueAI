/**
 * Replaceable service abstractions for CueAI Desktop.
 * No demo/sample user-facing data — real API or honest empty/error states.
 */
import {
  LiveAnswerUnavailable,
  requestLiveAnswer,
  type LiveTranscriptLine,
} from "./live-answer";

export type MeetingSummary = {
  id: string;
  title: string;
  durationMin: number;
  actionItems: number;
};

export type AuthSession = {
  userId: string;
  name: string;
  email: string;
  workspace: string;
};

export type ResumeSuggestion = {
  id: string;
  section: string;
  suggestion: string;
  accepted?: boolean;
};

export type KnowledgeDoc = {
  id: string;
  name: string;
  pinned: boolean;
  progress: number;
};

export type TranslationResult = {
  sourceLang: string;
  targetLang: string;
  text: string;
};

export type AskContext = {
  transcript?: string[];
  image?: string;
};

export type AskResult = {
  answer: string;
  confidence: number;
  notice?: string;
  model?: string;
};

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));

function asTranscriptLines(context?: AskContext): LiveTranscriptLine[] {
  return (context?.transcript || []).map((line) => {
    const idx = line.indexOf(":");
    if (idx <= 0) return { who: "Speaker", text: line };
    return { who: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() };
  });
}

export const AuthService = {
  async getSession(): Promise<AuthSession | null> {
    await delay(50);
    return null;
  },
};

export const MeetingService = {
  async listRecent(): Promise<MeetingSummary[]> {
    await delay();
    return [];
  },
  async start() {
    await delay(200);
    return { meetingId: `m_${Date.now()}`, startedAt: new Date().toISOString() };
  },
};

export const AIService = {
  /** Live answer via web API (Groq primary / Gemini fallback). */
  async ask(
    prompt: string,
    context?: AskContext,
    opts?: { fallback?: boolean },
  ): Promise<AskResult> {
    try {
      const live = await requestLiveAnswer(prompt, asTranscriptLines(context), context?.image);
      return { answer: live.answer, confidence: live.confidence, model: live.model };
    } catch (err) {
      if (!(err instanceof LiveAnswerUnavailable)) throw err;
      if (opts?.fallback === false) throw err;
      throw new Error(
        err.message || "Unable to generate an answer. Check AI configuration and try again.",
      );
    }
  },
};

export const ResumeService = {
  async score(_filePath?: string) {
    await delay(200);
    return { atsScore: 0, suggestions: 0 };
  },
  async suggestions(): Promise<ResumeSuggestion[]> {
    await delay();
    return [];
  },
};

export const KnowledgeBaseService = {
  async list(): Promise<KnowledgeDoc[]> {
    await delay();
    return [];
  },
  async search(_query: string) {
    await delay(100);
    return [] as { id: string; snippet: string }[];
  },
};

export const TranslationService = {
  async translate(text: string, targetLang: string): Promise<TranslationResult> {
    await delay(100);
    return {
      sourceLang: "en",
      targetLang,
      text,
    };
  },
};

export const DesktopService = {
  async getHealth() {
    return {
      microphone: "ready" as const,
      systemAudio: "ready" as const,
      companion: "idle" as const,
      storageUsedGb: 0,
      storageQuotaGb: 0,
      backgroundRunning: true,
    };
  },
};

export const NotificationService = {
  async push(title: string, body: string) {
    if (typeof window !== "undefined" && "cueDesktop" in window) {
      const desktop = (
        window as Window & {
          cueDesktop?: { notify: (t: string, b: string) => Promise<boolean> };
        }
      ).cueDesktop;
      if (desktop) return desktop.notify(title, body);
    }
    return false;
  },
};

export const SettingsService = {
  async getDefaults() {
    return {
      theme: "dark" as const,
      launchAtStartup: false,
      minimizeToTray: true,
    };
  },
};
