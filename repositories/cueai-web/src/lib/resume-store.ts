/**
 * Resumes the user uploaded — name plus extracted text for live interview answers.
 */

export type SavedResume = {
  id: string;
  name: string;
  updatedAt: string;
  text?: string;
};

const STORAGE_KEY = "cueai-resume-library";

export function loadSavedResumes(): SavedResume[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedResume[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberResume(name: string, text?: string): SavedResume {
  const existing = loadSavedResumes();
  const match = existing.find((r) => r.name === name);
  const id = match?.id || `res_${name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40)}_${Date.now()}`;
  const entry: SavedResume = {
    id,
    name,
    updatedAt: new Date().toISOString(),
    text: text?.trim() || match?.text,
  };
  const next = [entry, ...existing.filter((r) => r.id !== id && r.name !== name)].slice(0, 8);
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return entry;
}

export function getResumeById(id: string | undefined): SavedResume | undefined {
  if (!id) return undefined;
  return loadSavedResumes().find((r) => r.id === id);
}

/** Extract resume text on the server so PDF/DOCX work in the wizard. */
export async function extractAndRememberResume(file: File): Promise<SavedResume> {
  const body = new FormData();
  body.append("resume", file);
  const res = await fetch("/api/resume/extract", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok || !data.text) {
    throw new Error(data.error || "Could not read that resume.");
  }
  const saved = rememberResume(file.name, data.text);
  try {
    await fetch("/api/live/briefing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeName: file.name, resumeText: data.text }),
    });
  } catch {
    // Server briefing is also written by /api/resume/extract.
  }
  return saved;
}

export function resumeHasText(resume: SavedResume | undefined) {
  return Boolean(resume?.text && resume.text.trim().length > 40);
}
