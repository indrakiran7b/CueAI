import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, "apps/web/.env.local") });
process.chdir(path.join(root, "apps/web"));

const { embedText } = await import("../apps/web/src/lib/server/rag/embeddings.ts");
const { searchVectors } = await import("../apps/web/src/lib/server/rag/vector-store.ts");

const WS = "ws_semantic_e2e";
const q = "What API style does the client prefer?";
const v = await embedText(q);
const hits = await searchVectors({
  workspaceId: WS,
  vector: v,
  topK: 5,
  scoreThreshold: 0.05,
  meetingId: "mtg_sem_a",
  knowledgeScope: "meeting",
});
console.log("meeting A only:");
for (const h of hits) console.log(Number(h.score.toFixed(4)), h.payload.filename, h.payload.meeting_id);

const hitsB = await searchVectors({
  workspaceId: WS,
  vector: v,
  topK: 5,
  scoreThreshold: 0.05,
  meetingId: "mtg_sem_b",
  knowledgeScope: "meeting",
});
console.log("meeting B only:");
for (const h of hitsB) console.log(Number(h.score.toFixed(4)), h.payload.filename, h.payload.meeting_id);
