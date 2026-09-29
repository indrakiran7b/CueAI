#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
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

const args = [
  "-m",
  "celery",
  "-A",
  "app.core.celery:celery_app",
  "worker",
  "--loglevel=info",
  "-Q",
  "ai.chat,ai.vision,ai.resume,speech,translate,email,maintenance,licensing,celery",
];

const child = spawn(python, args, {
  cwd: API,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, PYTHONPATH: API },
});

child.on("exit", (code) => process.exit(code ?? 1));
