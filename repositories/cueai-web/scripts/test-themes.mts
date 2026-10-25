import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";

const DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-themes-"));
process.env.CUEAI_DATA_DIR = DATA_DIR;
process.env.AUTH_SECRET = "test-themes-secret-0123456789abcdef";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-themes-encryption-key-0123456789";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";

const themes = await import("../src/lib/themes");
const { updateStore, readStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const route = await import("../src/app/api/settings/appearance/route");

const { PALETTES, PALETTE_IDS, contrastRatio, paletteCssVars, paletteStylesheet, isPalettePreference } = themes;

/* ---------- Palette config ---------- */

test("ten palettes with stable ids, the requested brand colours, and both modes", () => {
  assert.deepEqual(
    PALETTES.map((p) => p.id),
    [...PALETTE_IDS],
  );
  const brand = Object.fromEntries(PALETTES.map((p) => [p.id, p.brand.map((b) => b.hex.toUpperCase())]));
  assert.deepEqual(brand, {
    "mocha-luxe": ["#5B4632", "#F4D9A0", "#C8792C"],
    "ivory-editorial": ["#EAE6DE", "#226192", "#FF7F50"],
    "neon-pulse": ["#0A0A0A", "#007BA7", "#FF2D95"],
    "aubergine-frost": ["#DDE3E8", "#3A0F34", "#EAAA00"],
    "mocha-serenity": ["#6F4E37", "#E5E4E2", "#E6E0F0"],
    "crimson-steel": ["#2A2A2A", "#C0C0C0", "#E10600"],
    "amethyst-voltage": ["#050505", "#3B0A6B", "#00E5FF"],
    "sage-hearth": ["#87A96B", "#5A3E2B", "#D5851F"],
    "pine-lilac": ["#E8DCC6", "#1F3B2E", "#CBB3E8"],
    "primary-pop": ["#B7D8F5", "#E10600", "#FFD700"],
  });
  for (const p of PALETTES) {
    assert.ok(p.name && p.description, `${p.id} has a name and description`);
    assert.ok(p.modes.light && p.modes.dark, `${p.id} defines light and dark tokens`);
  }
});

test("preference validation accepts only known ids and 'default'", () => {
  for (const id of [...PALETTE_IDS, "default"]) assert.ok(isPalettePreference(id), id);
  for (const bad of ["", "Mocha-Luxe", "dark", "<script>", null, 3, undefined]) assert.equal(isPalettePreference(bad), false);
});

/* ---------- WCAG AA contrast in every palette and mode ---------- */

const AA_TEXT = 4.5;
const AA_UI = 3;

for (const p of PALETTES) {
  for (const mode of ["light", "dark"] as const) {
    test(`${p.id} (${mode}) meets WCAG AA`, () => {
      const t = p.modes[mode];
      const check = (fg: string, bg: string, min: number, label: string) => {
        const r = contrastRatio(fg, bg);
        assert.ok(r >= min, `${label}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
      };
      for (const bg of [t.background, t.surfaceSolid, t.backgroundElevated]) {
        check(t.foreground, bg, AA_TEXT, "body text");
        check(t.foregroundMuted, bg, AA_TEXT, "muted text");
      }
      check(t.primaryForeground, t.primary, AA_TEXT, "text on primary");
      check(t.ctaForeground, t.cta, AA_TEXT, "text on action button");
      check(t.accent, t.background, AA_TEXT, "accent links");
      check(t.primary, t.background, AA_TEXT, "selected nav text");
      check(t.ring, t.background, AA_UI, "focus ring");
      for (const s of [t.successFg, t.warningFg, t.dangerFg]) check(s, t.background, AA_TEXT, "status text");
      check(t.chartTick, t.surfaceSolid, AA_UI, "chart axis labels");
      for (const c of t.chart) check(c, t.surfaceSolid, AA_UI, "chart series");
      assert.equal(new Set(t.chart.map((c) => c.toLowerCase())).size, t.chart.length, "chart series are distinct");
    });
  }
}

/* ---------- Generated stylesheet ---------- */

test("stylesheet scopes every palette by data-palette and adapts to the light/dark switch", () => {
  const css = paletteStylesheet();
  for (const p of PALETTES) {
    assert.ok(css.includes(`html[data-palette="${p.id}"]{color-scheme:dark;`), `${p.id} dark block`);
    assert.ok(css.includes(`html[data-palette="${p.id}"][data-theme="light"]{color-scheme:light;`), `${p.id} light block`);
    assert.ok(css.includes(`--cta:${p.modes.dark.cta}`));
    assert.ok(css.includes(`--background:${p.modes.light.background}`));
  }
  assert.ok(!/data-palette="default"/.test(css), "the default look needs no palette rules");
  assert.ok(!css.includes("</"), "nothing that could close the inline <style> tag");
  const vars = paletteCssVars(PALETTES[0]!.modes.dark);
  assert.ok(Object.keys(vars).every((k) => k.startsWith("--")));
  assert.equal(vars["--chart-1"], PALETTES[0]!.modes.dark.chart[0]);
});

/* ---------- Appearance API ---------- */

const now = new Date().toISOString();
await updateStore((s) => {
  s.workspace.id = "ws_a";
  s.users = ["usr_a", "usr_b"].map((id) => ({
    id,
    name: id === "usr_a" ? "User A" : "User B",
    email: `${id}@cueai.local`,
    passwordHash: "x",
    role: "User",
    status: "Active" as const,
    workspaceId: "ws_a",
    createdAt: now,
    plan: "free" as const,
    professionalProfile: { role: `${id} engineer`, updatedAt: now },
  }));
});

function req(uid: string | null, method = "GET", body?: unknown) {
  const cookie = uid
    ? `${SESSION_COOKIE}=${signSession({ userId: uid, email: `${uid}@cueai.local`, name: uid, role: "User", workspaceId: "ws_a", workspace: "ws_a" })}`
    : undefined;
  return new NextRequest("http://127.0.0.1:3000/api/settings/appearance", {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
const get = async (uid: string | null) => {
  const res = await route.GET(req(uid));
  return { status: res.status, body: (await res.json()) as { palette?: string | null; error?: string } };
};
const put = async (uid: string | null, body: unknown) => {
  const res = await route.PUT(req(uid, "PUT", body));
  return { status: res.status, body: (await res.json()) as { palette?: string; error?: string } };
};

test("the appearance API requires sign-in", async () => {
  assert.equal((await get(null)).status, 401);
  assert.equal((await put(null, { palette: "neon-pulse" })).status, 401);
});

test("no saved preference reads as null, so existing users keep the current default", async () => {
  const res = await get("usr_a");
  assert.equal(res.status, 200);
  assert.equal(res.body.palette, null);
});

test("saves, survives a new session, and stays isolated per user", async () => {
  const saved = await put("usr_a", { palette: "mocha-luxe" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.palette, "mocha-luxe");

  // A fresh request with a newly signed cookie (sign out, sign back in) reads it back from the store.
  assert.equal((await get("usr_a")).body.palette, "mocha-luxe");
  assert.equal((await get("usr_b")).body.palette, null, "user B is unaffected");

  await put("usr_b", { palette: "ivory-editorial", userId: "usr_a" });
  assert.equal((await get("usr_a")).body.palette, "mocha-luxe", "a userId in the body cannot write another user");
  assert.equal((await get("usr_b")).body.palette, "ivory-editorial");
});

test("invalid themes are rejected and change nothing", async () => {
  for (const body of [{ palette: "rainbow" }, { palette: 1 }, {}, "not json"]) {
    assert.equal((await put("usr_a", body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await get("usr_a")).body.palette, "mocha-luxe");
});

test("reset to default touches only the palette, never other settings", async () => {
  const withoutAppearance = async () => {
    const user = structuredClone((await readStore()).users.find((u) => u.id === "usr_a")!);
    delete user.appearance;
    return user;
  };
  const otherBefore = await withoutAppearance();
  const res = await put("usr_a", { palette: "default" });
  assert.equal(res.status, 200);
  assert.equal((await get("usr_a")).body.palette, "default");
  assert.equal((await readStore()).users.find((u) => u.id === "usr_a")!.appearance?.palette, "default");
  assert.deepEqual(await withoutAppearance(), otherBefore, "name, profile and every other field are unchanged");
});
