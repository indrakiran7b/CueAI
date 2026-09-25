export type KnowledgeDoc = {
  id: string;
  name: string;
  folder: string;
  tags: string[];
  updated: string;
  size: string;
  preview: string;
};

const STORAGE_KEY = "cueai-knowledge-docs";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function guessFolder(name: string): string {
  const lower = name.toLowerCase();
  if (/security|soc|privacy|compliance/.test(lower)) return "Security";
  if (/price|gtm|sales|packaging/.test(lower)) return "GTM";
  if (/arch|api|eng|companion|desktop/.test(lower)) return "Engineering";
  if (/sales|crm|outreach/.test(lower)) return "Sales";
  return "Engineering";
}

export function loadKnowledgeDocs(): KnowledgeDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KnowledgeDoc[];
    if (!Array.isArray(parsed)) return [];
    // Drop legacy seed docs if they were auto-written previously.
    return parsed.filter(
      (d) =>
        d?.id &&
        d.id !== "d1" &&
        d.id !== "d2" &&
        !/Security Whitepaper|Pricing & Packaging Q3/i.test(d.name || ""),
    );
  } catch {
    return [];
  }
}

function saveKnowledgeDocs(docs: KnowledgeDoc[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export async function addKnowledgeFiles(files: FileList | File[]): Promise<KnowledgeDoc[]> {
  const list = Array.from(files);
  const docs = loadKnowledgeDocs();
  for (const file of list) {
    let preview = "";
    try {
      const text = await file.text();
      preview = text.slice(0, 1200).trim() || `Uploaded file: ${file.name}`;
    } catch {
      preview = `Binary upload stored locally: ${file.name}`;
    }
    docs.unshift({
      id: crypto.randomUUID(),
      name: file.name,
      folder: guessFolder(file.name),
      tags: ["Uploaded"],
      updated: "just now",
      size: formatSize(file.size),
      preview,
    });
  }
  saveKnowledgeDocs(docs);
  return docs;
}

export function deleteKnowledgeDoc(id: string): KnowledgeDoc[] {
  const docs = loadKnowledgeDocs().filter((d) => d.id !== id);
  saveKnowledgeDocs(docs);
  return docs;
}

export function reindexKnowledgeDocs(): KnowledgeDoc[] {
  const docs = loadKnowledgeDocs().map((d) => ({
    ...d,
    updated: "just now",
    tags: d.tags.includes("Indexed") ? d.tags : [...d.tags, "Indexed"],
  }));
  saveKnowledgeDocs(docs);
  return docs;
}
