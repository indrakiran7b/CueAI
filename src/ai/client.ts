/**
 * AI provider stub for CueAI Android prototype.
 * Always uses mock answers unless VITE_AI_API_URL is set.
 * Provider picker (mock/grok/openai) is preference-only for demos.
 */

import { aiProviderDisplay, loadAiProvider } from "../lib/workspaces";

export type AiTask =
  | "ask"
  | "knowledge"
  | "resume-rewrite"
  | "meeting-summary"
  | "followup-email"
  | "live-suggest";

export type AiRequest = {
  task: AiTask;
  prompt: string;
  context?: string;
};

const apiUrl = (import.meta.env.VITE_AI_API_URL as string | undefined)?.trim() || "";

export function aiProviderLabel() {
  if (apiUrl) return `Remote · ${apiUrl}`;
  return aiProviderDisplay(loadAiProvider());
}

export function isRemoteAiConfigured() {
  return Boolean(apiUrl);
}

export async function runAi(req: AiRequest): Promise<string> {
  if (apiUrl) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, provider: loadAiProvider() }),
    });
    if (!res.ok) {
      throw new Error(`AI request failed (${res.status})`);
    }
    const data = (await res.json()) as { text?: string; answer?: string };
    return data.text || data.answer || JSON.stringify(data);
  }

  await delay(420 + Math.random() * 380);
  const provider = loadAiProvider();
  const prefix = provider === "mock" ? "" : `[${aiProviderDisplay(provider)}]\n`;
  return prefix + mockAnswer(req);
}

function delay(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms));
}

function mockAnswer(req: AiRequest): string {
  const q = req.prompt.trim();
  switch (req.task) {
    case "knowledge":
      return req.context?.trim() || `Knowledge-backed answer for “${q || "your question"}”.`;
    case "ask":
    case "live-suggest":
      return `Suggested reply:\n“We keep visual context on-device when possible, and Presenter Privacy Mode ensures the assistant does not appear in your shared screen — demos stay clean for everyone else.”\n\nFollow-ups:\n• Is transcription on-device or cloud?\n• Can admins enforce Privacy Mode?\n\nContext used:\n${req.context?.slice(0, 220) || "Meeting memory empty — answers use product defaults."}`;
    case "resume-rewrite":
      return (
        req.context?.trim() ||
        "Tailored resume draft ready — summary, experience, and skills aligned to the job description using only verified background."
      );
    case "meeting-summary":
      return `Executive summary\n${q.slice(0, 280) || "Team aligned on next steps and owners."}\n\nKey decisions\n• Confirm owners before end of week\n• Keep privacy controls opt-in\n\nAction items\n• Draft follow-up email\n• Share summary with attendees`;
    case "followup-email":
      return `Subject: Follow-up — ${q || "our meeting"}\n\nHi team,\n\nThanks for the discussion. Capturing decisions and owners below. Reply if I missed anything.\n\nBest,\nCueAI`;
    default:
      return "CueAI mock response.";
  }
}
