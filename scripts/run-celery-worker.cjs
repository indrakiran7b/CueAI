#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const API = path.join(__dirname, "..", "apps", "api");
const venvPython = path.join(API, ".venv", "Scripts", "python.exe");
const venvPythonUnix = path.join(API, ".venv", "bin", "python");
const python =
  (process.platform === "win32" && fs.existsSync(venvPython) && venvPython) ||
  (fs.existsSync(venvPythonUnix) && venvPythonUnix) ||
  "python";

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
