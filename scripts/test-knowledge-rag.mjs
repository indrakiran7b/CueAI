import { readFileSync } from "node:fs";
import path from "node:path";

const origin = process.argv[2] || "http://127.0.0.1:3002";
const email = process.argv[3] || "admin@cueai.local";
const password = process.argv[4] || "admin123";

async function login() {
  const res = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, cookie, body };
}

const auth = await login();
if (!auth.ok) {
  console.error("LOGIN_FAIL", auth.status, auth.body);
  process.exit(1);
}

const filePath = path.join(
  "repositories",
  "cueai-knowledge-service",
  "fixtures",
  "test_knowledge",
  "security",
  "Security_Architecture.txt",
);
const bytes = readFileSync(filePath);
const form = new FormData();
form.append(
  "file",
  new Blob([bytes], { type: "text/plain" }),
  "Security_Architecture.txt",
);
form.append("category", "security");
form.append("title", "Security_Architecture.txt");

const uploadRes = await fetch(`${origin}/api/admin/knowledge`, {
  method: "POST",
  headers: { Cookie: auth.cookie },
  body: form,
});
const uploadBody = await uploadRes.json().catch(() => ({}));
if (!uploadRes.ok) {
  console.error("UPLOAD_FAIL", uploadRes.status, uploadBody);
  process.exit(1);
}

const docId = uploadBody.item?.id;
let status = uploadBody.item?.status;
for (let i = 0; i < 20 && (status === "processing" || status === "uploaded"); i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const st = await fetch(`${origin}/api/admin/knowledge/${docId}`, {
    headers: { Cookie: auth.cookie },
  });
  const stBody = await st.json();
  status = stBody.item?.status;
}

async function ask(query) {
  const res = await fetch(`${origin}/api/admin/knowledge/query`, {
    method: "POST",
    headers: {
      Cookie: auth.cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const tls = await ask("What TLS version does the platform use?");
const japan = await ask("What is the capital of Japan?");

console.log(
  JSON.stringify(
    {
      origin,
      uploadStatus: uploadRes.status,
      docId,
      processingStatus: status,
      tls: {
        http: tls.status,
        knowledgeUsed: tls.body.knowledgeUsed ?? tls.body.knowledge_used,
        sourceType: tls.body.sourceType ?? tls.body.source_type,
        retrievalMethod: tls.body.retrievalMethod ?? tls.body.retrieval_method,
        sources: tls.body.sources,
        answer: String(tls.body.answer || "").slice(0, 400),
      },
      japan: {
        http: japan.status,
        knowledgeUsed: japan.body.knowledgeUsed ?? japan.body.knowledge_used,
        sourceType: japan.body.sourceType ?? japan.body.source_type,
        sources: japan.body.sources,
        answer: String(japan.body.answer || "").slice(0, 400),
      },
    },
    null,
    2,
  ),
);
