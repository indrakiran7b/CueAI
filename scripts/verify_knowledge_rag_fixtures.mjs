#!/usr/bin/env node
/**
 * Offline verification: extract test PDFs and keyword-score acceptance questions.
 * Does not call LLMs or mutate the workspace store.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(path.join(root, "apps/web/package.json"));

async function loadUnpdf() {
  try {
    return await import("unpdf");
  } catch {
    const webNodeModules = path.join(root, "apps/web/node_modules/unpdf");
    return import(pathToFileURLCompat(webNodeModules));
  }
}

function pathToFileURLCompat(p) {
  const { pathToFileURL } = require("url");
  // Resolve package entry
  const pkg = require(path.join(p, "package.json"));
  const entry = path.join(p, pkg.exports?.["."]?.import || pkg.module || pkg.main || "dist/index.mjs");
  return pathToFileURL(entry).href;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function score(query, hay) {
  const tokens = tokenize(query);
  const h = hay.toLowerCase();
  let s = 0;
  for (const t of tokens) if (h.includes(t)) s += t.length > 5 ? 2 : 1;
  return s;
}

const cases = [
  ["What encryption protocol is used for network communication?", /Security_Architecture/],
  ["How is authentication handled?", /Authentication_and_Authorization/],
  ["What backend framework does the application use?", /Backend_Architecture/],
  ["What frontend technology is used?", /Frontend_Architecture/],
  ["How are APIs structured?", /API_Architecture/],
  ["What is the target customer profile?", /Go_To_Market_Strategy/],
  ["What is the product positioning?", /Product_Positioning/],
  ["What are the stages of the sales process?", /Sales_Playbook|Enterprise_Sales_Process/],
];

const { extractText, getDocumentProxy } = await loadUnpdf();
const docs = [];
for (const cat of ["security", "gtm", "engineering", "sales", "data"]) {
  const dir = path.join(root, "test_knowledge", cat);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".pdf"))) {
    const buf = readFileSync(path.join(dir, f));
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : String(text || "");
    if (joined.trimStart().startsWith("%PDF-")) {
      throw new Error(`Raw PDF binary leaked for ${f}`);
    }
    docs.push({ cat, f, text: joined });
  }
}

let pass = 0;
for (const [q, expect] of cases) {
  const ranked = docs
    .map((d) => ({ ...d, s: score(q, d.text) }))
    .sort((a, b) => b.s - a.s);
  const top = ranked[0];
  const ok = top.s >= 3 && expect.test(top.f);
  console.log(ok ? "PASS" : "FAIL", q, "->", top.f, `(${top.s})`);
  if (ok) pass += 1;
}

const japan = docs
  .map((d) => ({ ...d, s: score("What is the capital of Japan?", d.text) }))
  .sort((a, b) => b.s - a.s)[0];
const fallbackOk = japan.s < 3;
console.log(
  fallbackOk ? "PASS" : "FAIL",
  "Japan capital fallback",
  "->",
  japan.f,
  `(${japan.s})`,
);

console.log(`\nExtracted ${docs.length} PDFs. Retrieval cases ${pass}/${cases.length}.`);
if (pass < cases.length || !fallbackOk) process.exit(1);
