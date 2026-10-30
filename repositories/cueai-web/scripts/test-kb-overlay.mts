/**
 * Knowledge Base mode for the live overlay (/api/live/answer with source "knowledge_base").
 * Real upload → extract → chunk → index pipeline (keyword retrieval, no vector DB), real routes,
 * and a local OpenAI-compatible test server standing in for the model provider.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";

const DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-kb-overlay-"));
process.env.CUEAI_DATA_DIR = DATA_DIR;
process.env.AUTH_SECRET = "test-kb-overlay-secret-0123456789abcdef";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-kb-overlay-encryption-key-0123456789";
process.env.CUEAI_ENV = "test";
process.env.CUEAI_LIVE_ANSWER_LOCAL = "1";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
process.env.RAG_EMBEDDING_PROVIDER = "none";
for (const name of [
  "QDRANT_URL",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "VERTEX_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
  "PERPLEXITY_API_KEY",
]) {
  delete process.env[name];
}

const KEY = "sk-test-kb-overlay-key-1a2b3c4d";
const NT = "NT: The answer was not found in your Knowledge Base documents. Please check the uploaded PDFs or DOCX files.";

/* ---------- Test-only OpenAI-compatible provider ---------- */

type Seen = { body: { model?: string; stream?: boolean; messages: { role: string; content: string }[] } };
const seen: Seen[] = [];
/** Builds the model's reply from the prompt it received. */
let reply: (prompt: string) => string = () => "unset";
let failWith: number | null = null;

/** Excerpt number in the prompt whose text contains `needle`. */
function excerptNo(prompt: string, needle: string): number {
  const parts = prompt.split(/\n(?=\[\d+\] \()/);
  for (const p of parts) {
    const m = p.match(/^\[(\d+)\] \(/m);
    if (m && p.includes(needle)) return Number(m[1]);
  }
  return 0;
}

const fake = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw) as Seen["body"];
    seen.push({ body });
    if (failWith) {
      res.writeHead(failWith, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "provider failure" } }));
    }
    const prompt = body.messages.map((m) => m.content).join("\n");
    const text = body.stream ? "General answer from the model." : reply(prompt);
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
      return res.end("data: [DONE]\n\n");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
});
await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
after(() => fake.close());

/* ---------- App modules ---------- */

const { updateStore, readStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE, encryptSecret } = await import("../src/lib/server/session");
const answerRoute = await import("../src/app/api/live/answer/route");
const kbRoute = await import("../src/app/api/admin/knowledge/route");
const reindexRoute = await import("../src/app/api/admin/knowledge/[id]/reindex/route");
const { docxBlob } = await import("@cueai/export-service/exportDocument");

const now = new Date().toISOString();
const USERS = {
  usr_admin_a: { name: "Admin A", role: "Admin", workspaceId: "ws_a" },
  usr_member_a: { name: "Member A", role: "User", workspaceId: "ws_a" },
  usr_admin_b: { name: "Admin B", role: "Admin", workspaceId: "ws_b" },
  usr_admin_c: { name: "Admin C", role: "Admin", workspaceId: "ws_c" },
} as const;
type Uid = keyof typeof USERS;

await updateStore((s) => {
  s.workspace.id = "ws_a";
  s.users = (Object.keys(USERS) as Uid[]).map((id) => ({
    id,
    name: USERS[id].name,
    email: `${id}@cueai.local`,
    passwordHash: "x",
    role: USERS[id].role,
    status: "Active" as const,
    workspaceId: USERS[id].workspaceId,
    createdAt: now,
    plan: "free" as const,
  }));
  s.userApiCredentials = (Object.keys(USERS) as Uid[]).map((id) => ({
    id: `cred_${id}`,
    workspaceId: USERS[id].workspaceId,
    userId: id,
    name: "Test key",
    provider: "openai" as const,
    model: "test-model",
    encryptedApiKey: encryptSecret(KEY),
    keyLast4: KEY.slice(-4),
    status: "connected" as const,
    capabilities: ["live_session", "general_ai", "rag"],
    endpoint: fakeUrl,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }));
  s.knowledge = [];
  s.meetings = [];
});

function cookie(uid: Uid) {
  const u = USERS[uid];
  const token = signSession({ userId: uid, email: `${uid}@cueai.local`, name: u.name, role: u.role, workspaceId: u.workspaceId, workspace: u.workspaceId });
  return `${SESSION_COOKIE}=${token}`;
}

type KbDone = {
  type: string;
  answer?: string;
  text?: string;
  error?: string;
  code?: string;
  kbStatus?: string;
  sourceType?: string;
  knowledgeUsed?: boolean;
  notice?: string | null;
  sources?: { ref: number; filename: string; page: number | null; excerpt: string }[];
};

async function askKb(uid: Uid, prompt: string, extra: Record<string, unknown> = {}) {
  const res = await answerRoute.POST(
    new NextRequest("http://127.0.0.1:3000/api/live/answer", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", cookie: cookie(uid) },
      body: JSON.stringify({ prompt, stream: true, mode: "answer", source: "knowledge_base", ...extra }),
    }),
  );
  const raw = await res.text();
  assert.ok(!raw.includes(KEY), "responses never contain the API key");
  const events = raw
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5).trim()) as KbDone);
  return { status: res.status, events, done: events.find((e) => e.type === "done"), error: events.find((e) => e.type === "error") };
}

async function upload(uid: Uid, file: File) {
  const form = new FormData();
  form.set("file", file);
  form.set("category", "engineering");
  const res = await kbRoute.POST(
    new NextRequest("http://127.0.0.1:3000/api/admin/knowledge", {
      method: "POST",
      headers: { cookie: cookie(uid) },
      body: form,
    }),
  );
  const body = (await res.json()) as { item?: { id: string }; error?: unknown };
  assert.equal(res.status, 202, `upload accepted: ${JSON.stringify(body.error)}`);
  return body.item!.id;
}

async function waitForStatus(id: string, status: string) {
  for (let i = 0; i < 200; i++) {
    const doc = (await readStore()).knowledge.find((k) => k.id === id);
    if (doc?.status === status) return doc;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`document ${id} never reached ${status}`);
}

async function makePdf(lines: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 740 - i * 18, size: 11, font }));
  return new File([Buffer.from(await pdf.save())], "refund-policy.pdf", { type: "application/pdf" });
}

function makeDocx(name: string, paragraphs: string[]) {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return new File([docxBlob(xml)], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

const PDF_LINES = [
  "Acme Corporation refund policy.",
  "Customers may request a refund within 30 days of purchase.",
  "Refunds are returned to the original payment method within five business days.",
];
const DOCX_PARAS = [
  "Engineering onboarding handbook.",
  "The onboarding buddy program pairs each new engineer with a mentor for 90 days.",
  "New engineers ship their first change during the second week.",
];

/* ---------- Setup: index one PDF and one DOCX in workspace A ---------- */

let pdfId = "";
let docxId = "";

test("setup: PDF and DOCX upload, extract, chunk and index to Ready", async () => {
  pdfId = await upload("usr_admin_a", await makePdf(PDF_LINES));
  docxId = await upload("usr_admin_a", makeDocx("onboarding-handbook.docx", DOCX_PARAS));
  const pdf = await waitForStatus(pdfId, "indexed");
  const docx = await waitForStatus(docxId, "indexed");
  assert.ok((pdf.chunks?.length || 0) > 0 && (docx.chunks?.length || 0) > 0, "documents were chunked");
  assert.equal(pdf.chunks?.[0]?.pageNumber, 1, "PDF chunks keep their page number");
});

/* ---------- Required scenarios ---------- */

test("1. PDF answer: grounded answer with filename, page and excerpt", async () => {
  reply = (p) => `Customers may request a refund within 30 days of purchase [${excerptNo(p, "30 days")}].`;
  const { status, done } = await askKb("usr_admin_a", "How many days do customers have to request a refund?");
  assert.equal(status, 200);
  assert.equal(done?.kbStatus, "answered");
  assert.equal(done?.sourceType, "knowledge_base");
  assert.match(done?.answer || "", /30 days/);
  assert.ok(!done?.answer?.includes("NT:"));
  const src = done?.sources?.[0];
  assert.equal(src?.filename, "refund-policy.pdf");
  assert.equal(src?.page, 1);
  assert.match(src?.excerpt || "", /30 days of purchase/);
});

test("2. DOCX answer: grounded answer cites the DOCX file", async () => {
  reply = (p) => `Each new engineer is paired with a mentor for 90 days [${excerptNo(p, "90 days")}].`;
  const { done } = await askKb("usr_admin_a", "How long does the onboarding buddy program pair engineers with a mentor?");
  assert.equal(done?.kbStatus, "answered");
  assert.match(done?.answer || "", /90 days/);
  assert.equal(done?.sources?.[0]?.filename, "onboarding-handbook.docx");
  assert.match(done?.sources?.[0]?.excerpt || "", /buddy program/);
});

test("3. Absent answer returns the exact NT notice and never calls the model", async () => {
  const before = seen.length;
  const { done } = await askKb("usr_admin_a", "What is the parental leave entitlement for contractors in Brazil?");
  assert.equal(done?.kbStatus, "not_found");
  assert.equal(done?.answer, NT);
  assert.deepEqual(done?.sources, []);
  assert.equal(seen.length, before, "no general AI call when no document is relevant");
});

test("3b. Model saying the excerpts do not answer also yields the NT notice", async () => {
  reply = () => NT;
  const { done } = await askKb("usr_admin_a", "Which payment method gets refunds for gift cards purchased abroad?");
  assert.equal(done?.kbStatus, "not_found");
  assert.equal(done?.answer, NT);
});

test("4. Partial answer: supported part answered, NT added for the rest", async () => {
  reply = (p) => `Customers may request a refund within 30 days of purchase [${excerptNo(p, "30 days")}].\n${NT}`;
  const { done } = await askKb("usr_admin_a", "What is the refund window for customers and who approves refunds over 10000 dollars?");
  assert.equal(done?.kbStatus, "partial");
  assert.match(done?.answer || "", /30 days/);
  assert.ok(done?.answer?.trim().endsWith(NT), "NT notice follows the supported part");
  assert.ok((done?.sources?.length || 0) > 0);
});

test("4b. Unsupported sentences from the model are removed and flagged with NT", async () => {
  reply = (p) =>
    `Customers may request a refund within 30 days of purchase [${excerptNo(p, "30 days")}]. The refund team was founded by Jane Smith in 1999.`;
  const { done } = await askKb("usr_admin_a", "How many days do customers have to request a refund?");
  assert.equal(done?.kbStatus, "partial");
  assert.ok(!/Jane|1999/.test(done?.answer || ""), "invented facts are not shown");
  assert.ok(done?.answer?.includes(NT));
});

test("5. Before indexing: documents still processing return a not-ready status, not NT", async () => {
  const id = await upload("usr_admin_c", makeDocx("security-guide.docx", ["Security guide: rotate production database passwords every 60 days."]));
  await waitForStatus(id, "indexed");
  await updateStore((s) => {
    s.knowledge.find((k) => k.id === id)!.status = "processing";
  });
  const before = seen.length;
  const { done } = await askKb("usr_admin_c", "How often are production database passwords rotated?");
  assert.equal(done?.kbStatus, "not_ready");
  assert.ok(!done?.answer?.startsWith("NT:"));
  assert.equal(seen.length, before);
});

test("6. Failed indexing reports the failure; retry re-indexes and answers", async () => {
  const doc = (await readStore()).knowledge.find((k) => k.workspaceId === "ws_c")!;
  await updateStore((s) => {
    const d = s.knowledge.find((k) => k.id === doc.id)!;
    d.status = "failed";
    d.processingError = "Simulated extraction failure.";
    d.chunks = [];
  });
  const failed = await askKb("usr_admin_c", "How often are production database passwords rotated?");
  assert.equal(failed.done?.kbStatus, "indexing_failed");
  assert.match(failed.done?.answer || "", /failed to index/i);

  const res = await reindexRoute.POST(
    new NextRequest(`http://127.0.0.1:3000/api/admin/knowledge/${doc.id}/reindex`, {
      method: "POST",
      headers: { cookie: cookie("usr_admin_c") },
    }),
    { params: Promise.resolve({ id: doc.id }) },
  );
  assert.equal(res.status, 200);
  const reindexed = await waitForStatus(doc.id, "indexed");
  assert.ok((reindexed.documentVersion || 1) > 1, "retry bumps the document version");

  reply = (p) => `Production database passwords are rotated every 60 days [${excerptNo(p, "60 days")}].`;
  const ok = await askKb("usr_admin_c", "How often are production database passwords rotated?");
  assert.equal(ok.done?.kbStatus, "answered");
  assert.match(ok.done?.answer || "", /60 days/);
});

test("7. Deleting a document removes it from Knowledge Base answers", async () => {
  const del = await kbRoute.DELETE(
    new NextRequest(`http://127.0.0.1:3000/api/admin/knowledge?id=${docxId}`, {
      method: "DELETE",
      headers: { cookie: cookie("usr_admin_a") },
    }),
  );
  assert.equal(del.status, 200);
  assert.ok(!(await readStore()).knowledge.some((k) => k.id === docxId));
  const before = seen.length;
  const { done } = await askKb("usr_admin_a", "How long does the onboarding buddy program pair engineers with a mentor?");
  assert.equal(done?.kbStatus, "not_found");
  assert.equal(done?.answer, NT);
  assert.equal(seen.length, before, "deleted content is not retrieved");
});

test("8. Cross-workspace isolation: another workspace cannot read these documents, even naming the workspace", async () => {
  const empty = await askKb("usr_admin_b", "How many days do customers have to request a refund?", { workspaceId: "ws_a" });
  assert.equal(empty.done?.kbStatus, "no_documents", "a client-supplied workspace id is ignored");

  const id = await upload("usr_admin_b", makeDocx("travel.docx", ["Travel policy: economy class is required for flights under six hours."]));
  await waitForStatus(id, "indexed");
  const before = seen.length;
  const other = await askKb("usr_admin_b", "How many days do customers have to request a refund?", { workspaceId: "ws_a" });
  assert.equal(other.done?.kbStatus, "not_found");
  for (const call of seen.slice(before)) {
    assert.ok(!call.body.messages.some((m) => m.content.includes("30 days of purchase")), "workspace A text never reaches workspace B's prompt");
  }
});

test("8b. Workspace members (non-admin) can query their workspace's documents", async () => {
  reply = (p) => `Customers may request a refund within 30 days of purchase [${excerptNo(p, "30 days")}].`;
  const { done } = await askKb("usr_member_a", "How many days do customers have to request a refund?");
  assert.equal(done?.kbStatus, "answered");
});

test("9. General AI mode still uses the normal live answer pipeline", async () => {
  const res = await answerRoute.POST(
    new NextRequest("http://127.0.0.1:3000/api/live/answer", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", cookie: cookie("usr_admin_a") },
      body: JSON.stringify({ prompt: "What is a Python decorator?", stream: true, mode: "answer" }),
    }),
  );
  const raw = await res.text();
  assert.equal(res.status, 200);
  const done = raw
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5).trim()) as KbDone)
    .find((e) => e.type === "done");
  assert.equal(done?.answer, "General answer from the model.");
  assert.equal(done?.kbStatus, undefined, "general answers are not labelled as Knowledge Base answers");
});

test("10. Knowledge Base mode never falls back to general AI when the provider fails", async () => {
  failWith = 500;
  try {
    const { done, error } = await askKb("usr_admin_a", "How many days do customers have to request a refund?");
    assert.equal(done, undefined, "no answer is produced");
    assert.ok(error, "an operational error is returned");
    assert.ok(!error?.error?.startsWith("NT:"), "a service failure is not reported as NT");
    assert.ok(!seen.at(-1)?.body.stream, "no streaming general-answer call was attempted");
  } finally {
    failWith = null;
  }
});

test("10b. Knowledge Base prompt is grounded and carries only excerpts, not session context", async () => {
  reply = (p) => `Customers may request a refund within 30 days of purchase [${excerptNo(p, "30 days")}].`;
  const before = seen.length;
  await askKb("usr_admin_a", "How many days do customers have to request a refund?", {
    sessionContext: "CANDIDATE RESUME: SECRET_RESUME_TEXT",
  });
  const call = seen[before];
  assert.ok(call);
  const system = call.body.messages.find((m) => m.role === "system")?.content || "";
  assert.match(system, /ONLY the numbered document excerpts/);
  assert.ok(!call.body.messages.some((m) => m.content.includes("SECRET_RESUME_TEXT")));
});

test("Knowledge Base mode requires sign-in", async () => {
  const res = await answerRoute.POST(
    new NextRequest("http://127.0.0.1:3000/api/live/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "refund window?", source: "knowledge_base" }),
    }),
  );
  assert.equal(res.status, 401);
});
