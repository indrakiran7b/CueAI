#!/usr/bin/env node
"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const API = path.join(__dirname, "..", "apps", "api");
const venvPython = path.join(API, ".venv", "Scripts", "python.exe");
const venvPythonUnix = path.join(API, ".venv", "bin", "python");
const python =
  (process.platform === "win32" && fs.existsSync(venvPython) && venvPython) ||
  (fs.existsSync(venvPythonUnix) && venvPythonUnix) ||
  "python";

execSync(`${python} -m pytest -m "not redis and not postgres and not celery"`, {
  cwd: API,
  stdio: "inherit",
  shell: true,
});
