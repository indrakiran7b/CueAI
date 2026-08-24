/**
 * Mock AI / translation helpers for the web Companion overlay.
 * Mirrors apps/desktop/src/services so the UI behaves the same offline.
 */

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

export const CompanionAI = {
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
