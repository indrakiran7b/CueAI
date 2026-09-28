import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, "apps/web/.env.local") });
process.chdir(path.join(root, "apps/web"));

const { embedText } = await import("../apps/web/src/lib/server/rag/embeddings.ts");
const { searchVectors } = await import("../apps/web/src/lib/server/rag/vector-store.ts");

const WS = "ws_semantic_e2e";
const qs = [
  "What TLS version is used for encrypted communication?",
  "What backend framework does the project use?",
  "What is the company GTM strategy?",
  "What is the company's GTM strategy?",
  "What are the sales stages?",
  "What is the capital of Japan?",
  "How is communication between services encrypted?",
  "What API style does the client prefer?",
  "Explain recursion in programming",
];

for (const q of qs) {
  const v = await embedText(q);
  const hits = await searchVectors({
    workspaceId: WS,
    vector: v,
    topK: 5,
    scoreThreshold: 0.05,
  });
  console.log("Q:", q);
  for (const h of hits.slice(0, 4)) {
    console.log(" ", Number(h.score.toFixed(4)), h.payload.filename);
  }
}
