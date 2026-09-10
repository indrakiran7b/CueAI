/**
 * Copies Next.js standalone output into apps/desktop/build-resources/web
 * so electron-builder can ship a self-contained test executable.
 *
 * IMPORTANT: electron-builder's default FileSet filters exclude node_modules
 * folders (even under extraResources). We rename node_modules to
 * standalone_modules so deps are packaged; Electron sets NODE_PATH to match.
 */
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const webDir = path.join(repoRoot, "apps", "web");
const standaloneRoot = path.join(webDir, ".next", "standalone");
const outDir = path.join(repoRoot, "apps", "desktop", "build-resources", "web");

function mustExist(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${label}: ${p}`);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

mustExist(standaloneRoot, "Next standalone build");

// Next nests by package path in the monorepo (web/… or legacy apps/web/…)
const nestedCandidates = [
  path.join(standaloneRoot, "web"),
  path.join(standaloneRoot, "apps", "web"),
];
const nested = nestedCandidates.find((p) =>
  fs.existsSync(path.join(p, "server.js"))
);
const serverDir = nested ?? standaloneRoot;

if (!fs.existsSync(path.join(serverDir, "server.js"))) {
  throw new Error("Could not find server.js in Next standalone output");
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// App files (server.js, package.json, .next/...)
copyDir(serverDir, outDir);

// Never ship a local workspace store: it holds real accounts and password
// hashes, and packaged builds read/write CUEAI_DATA_DIR under userData anyway.
fs.rmSync(path.join(outDir, ".data"), { recursive: true, force: true });

// Monorepo: dependencies live at standalone root node_modules
const standaloneNodeModules = path.join(standaloneRoot, "node_modules");
const nestedNodeModules = path.join(serverDir, "node_modules");
const modulesSrc = fs.existsSync(standaloneNodeModules)
  ? standaloneNodeModules
  : nestedNodeModules;

if (!fs.existsSync(modulesSrc)) {
  throw new Error("Could not find standalone node_modules");
}

// Avoid electron-builder excluding **/node_modules/**
const modulesDest = path.join(outDir, "standalone_modules");
copyDir(modulesSrc, modulesDest);

const staticSrc = path.join(webDir, ".next", "static");
mustExist(staticSrc, ".next/static");
copyDir(staticSrc, path.join(outDir, ".next", "static"));

const publicSrc = path.join(webDir, "public");
if (fs.existsSync(publicSrc)) {
  copyDir(publicSrc, path.join(outDir, "public"));
}

if (!fs.existsSync(path.join(modulesDest, "next"))) {
  throw new Error("standalone_modules/next missing after prepare");
}

console.log(`Prepared embedded web at ${outDir}`);
console.log(`Deps: ${modulesDest}`);
