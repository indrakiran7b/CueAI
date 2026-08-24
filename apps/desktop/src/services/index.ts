/**
 * Replaceable service abstractions for CueAI Desktop.
 * Swap mock implementations for real API clients without touching UI.
 */

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

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

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
  async ask(prompt: string) {
    await delay(500);
    const q = prompt.toLowerCase().trim();

    if (q === "regenerate" || q.includes("regenerate")) {
      return {
        answer:
          "Updated take: QA buffer holds if regression closes Wed EOD. Flag design polish as the only residual risk before Thursday freeze.",
        confidence: 0.9,
      };
    }
    if (q === "summarize" || q.includes("summarize")) {
      return {
        answer:
          "Summary: Ship before the board meeting if QA finishes by Thursday. Deck freeze remains Friday 5pm; 14 SP left in QA with Wednesday EOD as the realistic finish.",
        confidence: 0.94,
      };
    }
    if (q === "actions" || q.includes("action") || q.includes("draft action")) {
      return {
        answer:
          "Actions: 1) Finish QA regression by Wed EOD (Jordan). 2) Share draft board deck Thu AM (Sarah). 3) Confirm SSO questions with Security before Phase 3 (Marcus).",
        confidence: 0.93,
      };
    }
    if (q === "risks" || q.includes("risk")) {
      return {
        answer:
          "Risks: QA slip past Thursday collapses the buffer. Unestimated design polish may compress testing. Board deck freeze Friday 5pm leaves little recovery time.",
        confidence: 0.91,
      };
    }
    if (q.includes("explain")) {
      return {
        answer:
          "In plain terms: the team can ship on time if testing wraps Wednesday. Thursday is spare time. Friday is when the board slides get locked.",
        confidence: 0.95,
      };
    }
    if (q.includes("qa")) {
      return {
        answer:
          "QA has 14 SP remaining. Velocity supports a Wednesday EOD finish with Thursday as buffer.",
        confidence: 0.92,
      };
    }
    if (q.includes("translate")) {
      return {
        answer:
          "Translation ready — open the Translate tab and pick a language to rewrite the latest answer.",
        confidence: 0.88,
      };
    }

    return {
      answer: `Based on the live transcript regarding “${prompt.slice(0, 80)}”: the team is aligned on shipping before the board meeting if QA clears by Thursday.`,
      confidence: 0.9,
    };
  },
  async summarize() {
    await delay(600);
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
    await delay(400);
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
    if (typeof window !== "undefined" && window.cueai) {
      // Companion surface — main app uses cueDesktop.notify
    }
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
