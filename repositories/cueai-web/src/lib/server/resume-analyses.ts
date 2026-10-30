import { updateStore, type DbResumeAnalysis } from "@/lib/server/db";

const PER_USER = 20;

type Owner = { userId: string; workspaceId: string };

/**
 * Saves or updates one Resume Tailor analysis record. Only hashes, scores and requirement
 * names are stored; resume text and evidence snippets stay out of persistent storage.
 */
export async function saveResumeAnalysis(owner: Owner, record: Omit<DbResumeAnalysis, "userId" | "workspaceId" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  await updateStore((store) => {
    const list = (store.resumeAnalyses ??= []);
    const existing = list.find((r) => r.id === record.id && r.userId === owner.userId);
    if (existing) {
      Object.assign(existing, record, { updatedAt: now });
    } else {
      list.push({ ...record, ...owner, createdAt: now, updatedAt: now });
    }
    const mine = list.filter((r) => r.userId === owner.userId && r.workspaceId === owner.workspaceId);
    if (mine.length > PER_USER) {
      const drop = new Set(mine.slice(0, mine.length - PER_USER).map((r) => r.id));
      store.resumeAnalyses = list.filter((r) => !(drop.has(r.id) && r.userId === owner.userId));
    }
  });
}
