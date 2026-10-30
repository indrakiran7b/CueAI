/**
 * Overlay transparency (range, steps, IPC validation, the inline control) and question-only
 * answering (no default prompt, empty input sends nothing, auto-answer only for real questions).
 * Covers the Windows overlay (apps/desktop), the macOS overlay and the web companion.
 *   npm run test:transparency
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const ROOT = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");

const { TransparencyControl } = await import("../src/components/TransparencyControl");
const { pickManualQuestion } = await import("../src/lib/manual-question");
const { clearQuestionMemory, evaluateQuestion } = await import("../src/services/question-detection");
const { AutoAnswerController } = await import("../src/services/auto-answer-controller");

const overlays = [
  {
    name: "windows",
    lib: await import("../src/lib/overlay-transparency"),
    channels: await import("../electron/ipc/channels"),
  },
  {
    name: "macos",
    lib: await import("../../../repositories/cueai-desktop/macos/src/lib/overlay-transparency"),
    channels: await import("../../../repositories/cueai-desktop/macos/electron/ipc/channels"),
  },
];

const alphaOf = (css: string) => Number(css.match(/,\s*([\d.]+)\)$/)?.[1]);

for (const { name, lib, channels } of overlays) {
  describe(`${name} overlay transparency`, () => {
    it("defaults to 0% and clamps to 0–80 in 5-point steps", () => {
      assert.equal(lib.TRANSPARENCY_DEFAULT, 0);
      assert.equal(lib.TRANSPARENCY_MIN, 0);
      assert.equal(lib.TRANSPARENCY_MAX, 80);
      assert.equal(lib.TRANSPARENCY_STEP, 5);
      assert.equal(lib.clampTransparency(-5), 0, "minus never goes below 0");
      assert.equal(lib.clampTransparency(85), 80, "plus never goes above 80");
      assert.equal(lib.clampTransparency(42.6), 43);
      assert.equal(lib.clampTransparency("nope"), 0);
      assert.equal(lib.clampTransparency(Number.NaN), 0);
    });

    it("leaves the stylesheet untouched at 0% and only sets CSS variables otherwise", () => {
      assert.deepEqual(lib.overlayTransparencyVars(0), {});
      for (let p = 5; p <= 80; p += 5) {
        for (const [key, value] of Object.entries(lib.overlayTransparencyVars(p))) {
          assert.ok(key.startsWith("--"), `${p}%: ${key} is a custom property`);
          assert.doesNotMatch(String(value), /brightness|opacity|filter/i);
        }
      }
    });

    it("the main IPC handler accepts only whole numbers from 0 to 80", () => {
      for (const ok of [0, 5, 50, 80]) assert.equal(channels.isValidTransparency(ok), true, String(ok));
      for (const bad of [-1, 81, 10.5, "50", Number.NaN, null, undefined, {}]) {
        assert.equal(channels.isValidTransparency(bad), false, String(bad));
      }
    });
  });
}

describe("windows panels become see-through", () => {
  const lib = overlays[0]!.lib;
  it("50% leaves half the panel opacity and 80% leaves a fifth", () => {
    assert.equal(lib.overlayTransparencyVars(50)["--ov-alpha"], "0.5");
    assert.equal(lib.overlayTransparencyVars(80)["--ov-alpha"], "0.2");
  });
  it("menus stay at least 90% opaque so they remain usable", () => {
    for (let p = 5; p <= 80; p += 5) assert.ok(Number(lib.overlayTransparencyVars(p)["--ov-menu-alpha"]) >= 0.9);
  });
  it("the stylesheet drives panel backgrounds from --ov-alpha and never filters brightness", () => {
    const css = read("apps/desktop/src/index.css");
    assert.match(css, /rgb\(20 20 22 \/ var\(--ov-alpha, 1\)\)/);
    assert.doesNotMatch(css, /filter:\s*brightness/);
  });
  it("the overlay window supports per-pixel transparency on every platform", () => {
    const src = read("apps/desktop/electron/services/overlay-window-manager.ts");
    assert.match(src, /transparent: true,/);
    assert.match(src, /backgroundColor: "#00000000"/);
  });
});

describe("macos panels become see-through", () => {
  const lib = overlays[1]!.lib;
  it("panel alpha and backdrop blur fall as transparency rises; blur is gone at 80%", () => {
    let prevAlpha = 1;
    let prevBlur = 41;
    for (let p = 5; p <= 80; p += 5) {
      const v = lib.overlayTransparencyVars(p);
      const alpha = alphaOf(v["--hud-fill"]!);
      const blur = Number.parseInt(v["--hud-blur"]!, 10);
      assert.ok(alpha < prevAlpha && blur <= prevBlur, `${p}%`);
      prevAlpha = alpha;
      prevBlur = blur;
    }
    assert.equal(lib.overlayTransparencyVars(80)["--hud-blur"], "0px");
    assert.ok(alphaOf(lib.overlayTransparencyVars(80)["--hud-menu"]!) >= 0.9);
  });
});

describe("transparency control", () => {
  const render = (value: number, error: string | null = null) =>
    renderToStaticMarkup(createElement(TransparencyControl, { value, error, onChange: () => {} }));

  it("shows the label, a 0–80 slider and the current percentage", () => {
    const html = render(50);
    assert.match(html, />Transparency</);
    assert.match(html, /type="range"[^>]*min="0"[^>]*max="80"/);
    assert.match(html, /<output[^>]*>50%<\/output>/);
  });
  it("disables minus at 0% and plus at 80%", () => {
    assert.match(render(0), /aria-label="Decrease transparency" disabled=""/);
    assert.doesNotMatch(render(0), /aria-label="Increase transparency" disabled=""/);
    assert.match(render(80), /aria-label="Increase transparency" disabled=""/);
    assert.doesNotMatch(render(80), /aria-label="Decrease transparency" disabled=""/);
  });
  it("reports a failed save", () => {
    assert.match(render(30, "Transparency couldn't be saved."), /role="alert"/);
  });
  it("sits directly below the CueAI title in both overlays", () => {
    const win = read("apps/desktop/src/App.tsx");
    assert.match(win, /<\/div>\s*<TransparencyControl/, "Windows: right after the title row");
    const mac = read("repositories/cueai-desktop/macos/src/App.tsx");
    assert.match(mac, /<\/header>\s*<TransparencyControl/, "macOS: right after the title header");
  });
});

describe("question-only answering", () => {
  beforeEach(() => clearQuestionMemory());

  const OVERLAYS = [
    "apps/desktop/src/App.tsx",
    "repositories/cueai-desktop/macos/src/App.tsx",
    "repositories/cueai-desktop/windows/src/App.tsx",
    "repositories/cueai-web/src/components/companion/web-companion-overlay.tsx",
    "apps/web/src/components/companion/web-companion-overlay.tsx",
  ];

  it("no overlay carries a default prompt to send", () => {
    for (const file of OVERLAYS) assert.doesNotMatch(read(file), /self-introduction from my resume/, file);
  });

  it("the Answer button sends the typed question, else the last heard one, else nothing", () => {
    assert.equal(pickManualQuestion("  What is a mutex? ", "Tell me about yourself."), "What is a mutex?");
    assert.equal(pickManualQuestion("", "Explain closures in JavaScript."), "Explain closures in JavaScript.");
    assert.equal(pickManualQuestion("   ", "  "), null);
    assert.equal(pickManualQuestion(undefined, null), null);
  });

  it("an empty or whitespace question never reaches the AI", async () => {
    const requests: string[] = [];
    const c = new AutoAnswerController({ generate: async (r) => (requests.push(r.question), { answer: "x" }) });
    assert.equal(c.submit({ utteranceId: "m1", text: "   ", finalizedAt: 0, source: "manual" }).accepted, false);
    assert.equal(c.submit({ utteranceId: "m2", text: "", finalizedAt: 0, source: "manual" }).accepted, false);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(requests, []);
  });

  it("a manual question is sent to the AI exactly as asked", async () => {
    const requests: string[] = [];
    const c = new AutoAnswerController({ generate: async (r) => (requests.push(r.question), { answer: "x" }) });
    c.submit({ utteranceId: "m3", text: "How does a hash map handle collisions?", finalizedAt: 0, source: "manual" });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(requests, ["How does a hash map handle collisions?"]);
  });

  const AUTO = { who: "System", allowSelfQuestions: true, finalized: true, turnFinalized: true } as const;

  it("auto-answer skips interviewer speech that is not a question or request", () => {
    for (const text of [
      "I worked on the payments team for three years.",
      "Great, thanks for joining us today everyone.",
      "Our company builds tools for logistics teams.",
    ]) {
      assert.equal(evaluateQuestion(text, AUTO).reason, "not_question", text);
    }
  });

  it("auto-answer accepts genuine questions and spoken requests", () => {
    for (const text of [
      "Tell me about a project you are proud of.",
      "What is the difference between a process and a thread",
      "Write a function that reverses a linked list.",
      "Okay, design a rate limiter for an API.",
    ]) {
      assert.equal(evaluateQuestion(text, AUTO).accept, true, text);
    }
  });

  it("the same transcript segment is answered once", async () => {
    const requests: string[] = [];
    const c = new AutoAnswerController({ generate: async (r) => (requests.push(r.question), { answer: "x" }) });
    const q = "What is dependency injection?";
    c.submit({ utteranceId: "System-1", text: q, finalizedAt: 0, source: "auto" });
    assert.equal(c.submit({ utteranceId: "System-1", text: q, finalizedAt: 10, source: "auto" }).reason, "duplicate_event");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(c.submit({ utteranceId: "System-2", text: q, finalizedAt: 20, source: "auto" }).reason, "duplicate_question");
    assert.deepEqual(requests, [q]);
  });

  it("the Windows overlay no longer answers interviewer speech that isn't a question", () => {
    const src = read("apps/desktop/src/App.tsx");
    const call = src.slice(src.indexOf("const decision = evaluateQuestion("), src.indexOf("if (!decision.accept)"));
    assert.ok(call.length > 0);
    assert.doesNotMatch(call, /forceSystem/);
  });
});
