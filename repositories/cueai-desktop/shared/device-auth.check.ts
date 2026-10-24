import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname);

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("19. Mac registration still uses session fetch and existing endpoints", () => {
  const src = read("../macos/electron/platform/macos/macosDevice.ts");
  assert.match(src, /\/api\/devices\/register/);
  assert.match(src, /\/api\/devices\/status/);
  assert.match(src, /saveCredential/);
  assert.match(src, /device\.identity/);
});

test("20. Mac credential stays in main-process safeStorage", () => {
  const src = read("../macos/electron/platform/macos/macosDevice.ts");
  assert.match(src, /safeStorage/);
  assert.match(src, /function getCredential/);
  assert.doesNotMatch(src, /localStorage/);
  const preload = read("../macos/electron/preload/index.ts");
  assert.match(preload, /DEVICE_GET_AUTH_HEADERS/);
  assert.doesNotMatch(preload, /getCredential\(/);
});

test("21-22. Mac overlay and transcription send device headers", () => {
  const live = read("../macos/src/services/live-answer.ts");
  const audio = read("../macos/src/services/audio-listen.ts");
  const ipc = read("../macos/electron/ipc/handlers.ts");
  assert.match(live, /deviceAuthHeaders/);
  assert.match(audio, /deviceAuthHeaders/);
  assert.match(ipc, /getAuthHeaders\(\)/);
  assert.match(ipc, /\/api\/transcribe/);
});

test("23-24. Windows registration and DPAPI account-device store", () => {
  const src = read("../windows/electron/platform/windows/windowsDevice.ts");
  assert.match(src, /\/api\/devices\/register/);
  assert.match(src, /\/api\/devices\/status/);
  assert.match(src, /account\.device\.identity/);
  assert.match(src, /safeStorage/);
  assert.match(src, /platform: "windows"/);
});

test("25-26. Windows overlay and transcription send device headers", () => {
  const live = read("../windows/src/services/live-answer.ts");
  const audio = read("../windows/src/services/audio-listen.ts");
  const persist = read("../windows/src/services/meeting-persist.ts");
  const screen = read("../windows/src/services/screen-context.ts");
  const ipc = read("../windows/electron/ipc/handlers.ts");
  assert.match(live, /deviceAuthHeaders/);
  assert.match(audio, /deviceAuthHeaders/);
  assert.match(persist, /deviceAuthHeaders/);
  assert.match(screen, /deviceAuthHeaders/);
  assert.match(ipc, /windowsDeviceService\.getAuthHeaders/);
});

test("27. Windows does not use license.device as account auth", () => {
  const src = read("../windows/electron/platform/windows/windowsDevice.ts");
  assert.match(src, /account\.device\.identity/);
  assert.doesNotMatch(src, /["']license\.device["']/);
  assert.doesNotMatch(src, /getLicenseDevice/);
  assert.doesNotMatch(src, /getOrCreateDeviceId/);
});

test("28. No device-verification or license gate blocks the desktop app", () => {
  const layout = read("../../cueai-web/src/app/(app)/layout.tsx");
  assert.doesNotMatch(layout, /DeviceGate/);
  for (const shell of ["windows", "macos"]) {
    const preload = read(`../${shell}/electron/preload/index.ts`);
    assert.doesNotMatch(preload, /DEVICE_VERIFY|DEVICE_REGISTER|LICENSE_/);
    const mainWindow = read(`../${shell}/electron/windows/main-window.ts`);
    assert.doesNotMatch(mainWindow, /\/license/);
  }
});
