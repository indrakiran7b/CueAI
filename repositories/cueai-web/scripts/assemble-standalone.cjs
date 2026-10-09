/**
 * Assemble Next standalone output for Docker:
 * copy traced server + public + .next/static next to server.js.
 * Does not copy the full installer node_modules tree.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const webRoot = path.resolve(__dirname, "..");
const standalone = path.join(webRoot, ".next", "standalone");
const out = process.argv[2] ? path.resolve(process.argv[2]) : "/out";

if (!fs.existsSync(standalone)) {
  throw new Error("missing .next/standalone — run next build first");
}

function walkServerJs(dir, found = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkServerJs(p, found);
    else if (ent.name === "server.js") found.push(p);
  }
  return found;
}

const candidates = [
  path.join(standalone, "cueai-web"),
  path.join(standalone, "repositories", "cueai-web"),
  path.join(standalone, "web"),
  standalone,
];
const serverDir =
  candidates.find((p) => fs.existsSync(path.join(p, "server.js"))) ||
  walkServerJs(standalone)
    .map((file) => path.dirname(file))
    .find(Boolean);

if (!serverDir || !fs.existsSync(path.join(serverDir, "server.js"))) {
  throw new Error(
    "standalone server.js not found under " +
      standalone +
      ": " +
      walkServerJs(standalone).join(", "),
  );
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(serverDir, out, { recursive: true });

const rootNm = path.join(standalone, "node_modules");
if (fs.existsSync(rootNm) && path.resolve(serverDir) !== path.resolve(standalone)) {
  fs.cpSync(rootNm, path.join(out, "node_modules"), { recursive: true });
}

fs.mkdirSync(path.join(out, ".next"), { recursive: true });
const publicDir = path.join(webRoot, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(out, "public"), { recursive: true });
}
fs.cpSync(
  path.join(webRoot, ".next", "static"),
  path.join(out, ".next", "static"),
  { recursive: true },
);

if (!fs.existsSync(path.join(out, "server.js"))) {
  throw new Error("assembled server.js missing in " + out);
}

console.log("standalone assembled at", out, "from", serverDir);
