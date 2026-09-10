/**
 * Live session setup — what the user enters before the companion opens.
 * Stored in sessionStorage so Start Meeting / refresh can resume the live view.
 */

export type LiveSessionKind = "interview" | "regular";

export type LiveGuidanceLevel = "minimal" | "balanced" | "maximum";

export type LiveSessionConfig = {
  kind: LiveSessionKind;
  /** Interview */
  jobLink?: string;
  company?: string;
  jobDescription?: string;
  resumeId?: string;
  resumeName?: string;
  resumeText?: string;
  /** Regular */
  callTitle?: string;
  description?: string;
  /** Shared */
  documentScope: "all" | string;
  /** Step 2 — Preferences */
  guidance: LiveGuidanceLevel;
  startMode: "private" | "live";
  autoAnswer: boolean;
  /** Set after the meeting row is created so Start Meeting can resume. */
  meetingId?: string;
};

export const DEFAULT_LIVE_SESSION_CONFIG: LiveSessionConfig = {
  kind: "interview",
  documentScope: "all",
  guidance: "balanced",
  startMode: "private",
  autoAnswer: true,
};

const STORAGE_KEY = "cueai-live-session-config";

export function sessionTitle(config: LiveSessionConfig): string {
  if (config.kind === "interview") {
    const company = config.company?.trim();
    return company ? `${company} interview` : "Interview session";
  }
  return config.callTitle?.trim() || "Live session";
}

export function saveLiveSessionConfig(config: LiveSessionConfig) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadLiveSessionConfig(): LiveSessionConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_LIVE_SESSION_CONFIG, ...(JSON.parse(raw) as LiveSessionConfig) };
  } catch {
    return null;
  }
}

export function clearLiveSessionConfig() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Hint for Gemini prompts built from the wizard answers. */
export function describeLiveSessionContext(config: LiveSessionConfig): string {
  const lines: string[] = [];
  if (config.kind === "interview") {
    if (config.company) lines.push(`Interview at: ${config.company}`);
    if (config.jobDescription) lines.push(`Job description:\n${config.jobDescription.slice(0, 1200)}`);
    if (config.jobLink) lines.push(`Job posting: ${config.jobLink}`);
    if (config.resumeName) lines.push(`Resume on file: ${config.resumeName}`);
    if (config.resumeText) lines.push(`CANDIDATE RESUME:\n${config.resumeText.slice(0, 8000)}`);
  } else {
    if (config.callTitle) lines.push(`Call: ${config.callTitle}`);
    if (config.description) lines.push(`Context:\n${config.description.slice(0, 800)}`);
  }
  lines.push(`Guidance: ${config.guidance}`);
  return lines.join("\n");
}
