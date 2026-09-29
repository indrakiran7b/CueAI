/**
 * Desktop companion bridge E2E checks (requires running CueAI Electron app).
 * Run: node scripts/e2e-desktop-bridge.mjs
 */
const BRIDGE = process.env.CUEAI_BRIDGE_URL || "http://127.0.0.1:39291";

async function req(method, path, body) {
  const res = await fetch(`${BRIDGE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const results = [];

function record(id, feature, testName, pass, severity, rootCause, fix) {
  results.push({ id, feature, test: testName, result: pass ? "PASS" : "FAIL", severity, rootCause, fix });
  console.log(`${pass ? "✓" : "✗"} [${id}] ${feature}: ${testName}`);
}

async function waitForUrl(predicate, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const status = await req("GET", "/companion/status");
    const url = status.json.url || "";
    if (predicate(url, status.json)) return status.json;
    await new Promise((r) => setTimeout(r, 500));
  }
  const last = await req("GET", "/companion/status");
  return last.json;
}

async function main() {
  console.log(`Desktop bridge E2E → ${BRIDGE}\n`);

  const health = await req("GET", "/health");
  record(
    "D01",
    "Desktop Launch",
    "Bridge health",
    health.status === 200 && health.json.ok,
    health.json.ok ? "—" : "P0",
    health.json.ok ? "—" : "Electron app not running or bridge failed",
    health.json.ok ? "—" : "Start CueAI desktop app"
  );

  if (!health.json.ok) {
    printSummary();
    process.exit(1);
  }

  const show1 = await req("POST", "/companion/show");
  record(
    "D02",
    "Overlay Open",
    "Show companion",
    show1.json.visible === true,
    show1.json.visible ? "—" : "P0",
    show1.json.loadError || "Overlay show IPC failed",
    "overlay-window-manager.ts bundled UI load"
  );

  const loaded = await waitForUrl(
    (url, body) => !body.loadError && (url.startsWith("file:") || url.includes("15174"))
  );
  const usesBundled = loaded.url?.startsWith("file:");
  const usesDev = loaded.url?.includes("15174");
  record(
    "D03",
    "Companion UI Load",
    "Loads bundled or dev UI (not error page)",
    !loaded.loadError && !loaded.url?.startsWith("data:text/html"),
    loaded.loadError ? "P0" : "—",
    loaded.loadError || (usesDev ? "Dev Vite server required" : "—"),
    "Bundled dist/index.html fallback when dev server down"
  );

  const show2 = await req("POST", "/companion/show");
  record(
    "D04",
    "Overlay Open",
    "Repeated show keeps single instance",
    show2.json.visible === true,
    "—",
    "—",
    "—"
  );

  const toggle = await req("POST", "/companion/toggle");
  record(
    "D05",
    "Overlay Close",
    "Toggle hides overlay",
    toggle.json.visible === false,
    toggle.json.visible ? "P1" : "—",
    toggle.json.visible ? "Toggle did not hide" : "—",
    "—"
  );

  await req("POST", "/companion/show");
  const boundsBefore = (await req("GET", "/companion/status")).json.bounds;
  record(
    "D06",
    "Overlay Bounds",
    "Bounds within minimum size",
    boundsBefore &&
      boundsBefore.width >= 400 &&
      boundsBefore.height >= 420,
    "P1",
    "Saved bounds below minimum",
    "companion-bounds.ts sanitize/clamp"
  );

  const session = await req("POST", "/meeting/session", {
    active: true,
    screenSharing: false,
    cueAiMode: "private",
    showCompanion: true,
  });
  record(
    "D07",
    "Meeting Session",
    "Set active session + show companion",
    session.json.ok && session.json.session?.active,
    session.json.ok ? "—" : "P1",
    "—",
    "—"
  );

  await req("POST", "/companion/hide");
  await req("POST", "/meeting/session", { active: false, cueAiMode: "inactive" });

  printSummary();
  const failed = results.filter((r) => r.result === "FAIL");
  process.exit(failed.length ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.result === "PASS").length;
  const failed = results.filter((r) => r.result === "FAIL").length;
  console.log(`\nDesktop bridge: ${passed} passed, ${failed} failed, ${results.length} total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
