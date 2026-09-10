/**
 * Replaceable service abstractions for CueAI Desktop.
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
  /** Set when the answer came from the offline sample instead of Gemini. */
  notice?: string;
  model?: string;
};

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));

function recentContext(context?: AskContext) {
  return (context?.transcript || []).slice(-4).join(" ");
}

function asTranscriptLines(context?: AskContext): LiveTranscriptLine[] {
  return (context?.transcript || []).map((line) => {
    const idx = line.indexOf(":");
    if (idx <= 0) return { who: "Speaker", text: line };
    return { who: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() };
  });
}

export const AuthService = {
  async getSession(): Promise<AuthSession | null> {
    await delay(100);
    return {
      userId: "u_demo",
      name: "Demo User",
      email: "demo@cueai.app",
      workspace: "CueAI",
    };
  },
};

export const MeetingService = {
  async listRecent(): Promise<MeetingSummary[]> {
    await delay();
    return [
      { id: "m1", title: "Q3 Product Sync", durationMin: 42, actionItems: 5 },
      { id: "m2", title: "Customer Discovery", durationMin: 28, actionItems: 3 },
      { id: "m3", title: "Design Critique", durationMin: 35, actionItems: 4 },
    ];
  },
  async start() {
    await delay(200);
    return { meetingId: `m_${Date.now()}`, startedAt: new Date().toISOString() };
  },
};

export const AIService = {
  /** Gemini via the web API. Overlay callers should pass `{ fallback: false }`. */
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
      const fallback = await AIService.askOffline(prompt, context);
      return { ...fallback, notice: err.message };
    }
  },

  async askOffline(prompt: string, context?: AskContext): Promise<AskResult> {
    await delay(120);
    const q = prompt.toLowerCase().trim();
    const heard = recentContext(context);

    if (heard && (q.startsWith("respond") || q.startsWith("brief response"))) {
      return {
        answer: `Got it. Based on what I heard — "${heard.slice(-180)}" — I can help summarize, list actions, or answer follow-ups.`,
        confidence: 0.92,
      };
    }

    if (q === "regenerate" || q.includes("regenerate")) {
      return {
        answer: heard
          ? `Updated take on "${heard.slice(-120)}": key point captured; suggest confirming next steps with the team.`
          : "Updated take: QA buffer holds if regression closes Wed EOD.",
        confidence: 0.9,
      };
    }
    if (q === "summarize" || q.includes("summarize")) {
      return {
        answer: heard
          ? `Summary: ${heard.slice(-220)}`
          : "Summary: Ship before the board meeting if QA finishes by Thursday.",
        confidence: 0.94,
      };
    }
    if (q === "actions" || q.includes("action") || q.includes("draft action")) {
      return {
        answer: heard
          ? `Suggested actions from transcript: review "${heard.slice(-100)}", assign owner, set deadline.`
          : "Actions: 1) Finish QA regression by Wed EOD. 2) Share draft board deck Thu AM.",
        confidence: 0.93,
      };
    }
    if (q === "risks" || q.includes("risk")) {
      return {
        answer: heard
          ? `Risk check on "${heard.slice(-100)}": timeline slip if follow-up is delayed.`
          : "Risks: QA slip past Thursday collapses the buffer.",
        confidence: 0.91,
      };
    }
    if (q.includes("explain")) {
      return {
        answer: heard
          ? `In plain terms: ${heard.slice(-180)}`
          : "In plain terms: the team can ship on time if testing wraps Wednesday.",
        confidence: 0.95,
      };
    }

    return {
      answer: heard
        ? `Regarding “${prompt.slice(0, 80)}” — from the live transcript: ${heard.slice(-200)}`
        : `Based on “${prompt.slice(0, 80)}”: enable Mic, speak for ~2 seconds, and I will respond here.`,
      confidence: 0.9,
    };
  },
  async summarize() {
    await delay(300);
    return {
      summary: "Team aligned on board deck freeze Friday 5pm. QA is the critical path.",
      actionItems: ["Finish regression by Wed", "Share draft deck Thu AM"],
    };
  },
};

export const ResumeService = {
  async score(_filePath?: string) {
    await delay(700);
    return { atsScore: 78, suggestions: 6 };
  },
  async suggestions(): Promise<ResumeSuggestion[]> {
    await delay();
    return [
      {
        id: "r1",
        section: "Experience",
        suggestion: "Quantify impact with metrics in the last two roles.",
      },
      {
        id: "r2",
        section: "Skills",
        suggestion: "Move TypeScript and React higher for ATS keyword match.",
      },
    ];
  },
};

export const KnowledgeBaseService = {
  async list(): Promise<KnowledgeDoc[]> {
    await delay();
    return [
      { id: "d1", name: "Product Spec v3.pdf", pinned: true, progress: 100 },
      { id: "d2", name: "Brand Guidelines.docx", pinned: false, progress: 100 },
      { id: "d3", name: "Q3 Notes.md", pinned: false, progress: 62 },
    ];
  },
  async search(query: string) {
    await delay(400);
    return [{ id: "d1", snippet: `…relevant to “${query}” in Product Spec…` }];
  },
};

export const TranslationService = {
  async translate(text: string, targetLang: string): Promise<TranslationResult> {
    await delay(200);
    return {
      sourceLang: "en",
      targetLang,
      text: `[${targetLang}] ${text}`,
    };
  },
};

export const DesktopService = {
  async getHealth() {
    return {
      microphone: "ready" as const,
      systemAudio: "ready" as const,
      companion: "idle" as const,
      storageUsedGb: 2.4,
      storageQuotaGb: 10,
      backgroundRunning: true,
    };
  },
};

export const NotificationService = {
  async push(title: string, body: string) {
    if (typeof window !== "undefined" && "cueDesktop" in window) {
      const desktop = (window as Window & { cueDesktop?: { notify: (t: string, b: string) => Promise<boolean> } })
        .cueDesktop;
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
