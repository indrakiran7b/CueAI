#!/usr/bin/env node
"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const API = path.resolve(__dirname, "..");
function resolvePython() {
  for (const root of [API]) {
    const venvPython = path.join(root, ".venv", "Scripts", "python.exe");
    const venvPythonUnix = path.join(root, ".venv", "bin", "python");
    if (process.platform === "win32" && fs.existsSync(venvPython)) return venvPython;
    if (fs.existsSync(venvPythonUnix)) return venvPythonUnix;
  }
  return "python";
}
const python = resolvePython();

execSync(`${python} scripts/verify_celery_task.py`, {
  cwd: API,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PYTHONPATH: API },
});
