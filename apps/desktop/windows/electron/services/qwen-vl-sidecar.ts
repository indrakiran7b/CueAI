import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export const QWEN_VL_PORT = 39292;

let child: ChildProcess | null = null;

function repoRoot(): string {
  const fromApp = path.resolve(app.getAppPath(), "../..");
  const marker = path.join(fromApp, "tools", "qwen-vl", "server.py");
  if (fs.existsSync(marker)) return fromApp;
  return path.resolve(__dirname, "../../../../..");
}

function pythonBin(root: string): string | null {
  const venv = path.join(root, "tools", "qwen-vl", ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venv)) return venv;
  return null;
}

export function startQwenVlSidecar() {
  if (child && !child.killed) return;
  const root = repoRoot();
  const script = path.join(root, "tools", "qwen-vl", "server.py");
  const python = pythonBin(root);
  if (!python || !fs.existsSync(script)) {
    console.log("[QWEN-VL] Sidecar not installed yet. Run npm run dev:vision");
    return;
  }

  child = spawn(python, [script], {
    cwd: path.dirname(script),
    stdio: "pipe",
    windowsHide: true,
    env: {
      ...process.env,
      CUEAI_QWEN_VL_PORT: String(QWEN_VL_PORT),
    },
  });
  child.stdout?.on("data", (buf) => process.stdout.write(`[QWEN-VL] ${buf}`));
  child.stderr?.on("data", (buf) => process.stderr.write(`[QWEN-VL] ${buf}`));
  child.on("exit", (code) => {
    console.log(`[QWEN-VL] exited ${code ?? "?"}`);
    child = null;
  });
}

export function stopQwenVlSidecar() {
  if (!child || child.killed) return;
  child.kill();
  child = null;
}
