/**
 * AI / translation helpers for the web Companion overlay.
 * Calls the Gemini-backed live answer API, with the same offline sample
 * answers as apps/desktop/src/services so the UI behaves identically
 * when the server has no Gemini key.
 */

import type { LiveTranscriptLine } from "@/lib/live-answer";

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

export type CompanionAnswer = {
  answer: string;
  confidence: number;
  /** Set when the answer came from the offline sample instead of Gemini. */
  notice?: string;
  model?: string;
};

async function loadSessionContext() {
  try {
    const res = await fetch("/api/live/briefing", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      briefing?: {
        company?: string;
        jobDescription?: string;
        resumeName?: string;
        resumeText?: string;
        description?: string;
      } | null;
    };
    const b = data.briefing;
    if (!b?.resumeText && !b?.jobDescription && !b?.company) return "";
    return [
      b.company ? `Interview at: ${b.company}` : "",
      b.jobDescription ? `Job description:\n${b.jobDescription}` : "",
      b.resumeName ? `Resume on file: ${b.resumeName}` : "",
      b.resumeText ? `CANDIDATE RESUME:\n${b.resumeText}` : "",
      b.description ? `Context:\n${b.description}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

async function askGemini(
  prompt: string,
  transcript: LiveTranscriptLine[],
): Promise<CompanionAnswer> {
  const sessionContext = await loadSessionContext();
  const res = await fetch("/api/live/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, transcript, sessionContext }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    answer?: string;
    confidence?: number;
    model?: string;
    error?: string;
  };
  if (!res.ok || !data.answer) {
    throw new Error(data.error || "Gemini could not answer that.");
  }
  return {
    answer: data.answer,
    confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
    model: data.model,
  };
}

export const CompanionAI = {
  async ask(prompt: string, transcript: LiveTranscriptLine[] = []): Promise<CompanionAnswer> {
    try {
      return await askGemini(prompt, transcript);
    } catch (err) {
      const offline = await CompanionAI.askOffline(prompt);
      return {
        ...offline,
        notice: err instanceof Error ? err.message : "Showing an offline sample answer.",
      };
    }
  },

  async askOffline(prompt: string): Promise<CompanionAnswer> {
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
};

export const CompanionTranslation = {
  async translate(text: string, targetLang: string) {
    await delay(400);
    return {
      sourceLang: "en",
      targetLang,
      text: `[${targetLang}] ${text}`,
    };
  },
};
