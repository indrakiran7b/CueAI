/**
 * Knowledge Base category helpers (workspace documents).
 */

export const KNOWLEDGE_CATEGORIES = ["security", "gtm", "engineering", "sales"] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  security: "Security",
  gtm: "GTM",
  engineering: "Engineering",
  sales: "Sales",
};

export function isKnowledgeCategory(value: unknown): value is KnowledgeCategory {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value.toLowerCase())
  );
}

export function normalizeKnowledgeCategory(value: unknown): KnowledgeCategory {
  if (isKnowledgeCategory(value)) return value.toLowerCase() as KnowledgeCategory;
  return "engineering";
}

export function categoryLabel(category?: string | null): string {
  if (!category) return "Engineering";
  const key = category.toLowerCase();
  if (isKnowledgeCategory(key)) return KNOWLEDGE_CATEGORY_LABELS[key];
  return category;
}
