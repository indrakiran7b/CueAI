/**
 * Captures CueAI prototype screens for Google Stitch import.
 * Run: npx playwright install chromium; node scripts/capture-stitch.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../stitch-export");
const base = "http://127.0.0.1:5173/";

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log("saved", name);
}

async function clickText(page, name, exact = false) {
  const btn = page.getByRole("button", { name, exact });
  await btn.first().click({ timeout: 8000 });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 2,
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // 01 Splash
  await shot(page, "01-splash");
  await clickText(page, "Enter Android prototype");
  await page.waitForTimeout(500);

  // 02 Home
  await shot(page, "02-home");

  // 03 Live launcher
  await clickText(page, "Live", true);
  await page.waitForTimeout(400);
  await shot(page, "03-live-launcher");

  // 04 Live overlay session (Meet)
  await clickText(page, "Start overlay session");
  await page.waitForTimeout(700);
  await shot(page, "04-live-overlay-meet");

  // Stop session back to launcher then Notes
  await clickText(page, "Stop");
  await page.waitForTimeout(400);

  // 05 Notes
  await clickText(page, "Notes", true);
  await page.waitForTimeout(400);
  await shot(page, "05-notes-short");

  const detailed = page.getByRole("button", { name: "Detailed", exact: true });
  if (await detailed.count()) {
    await detailed.click();
    await page.waitForTimeout(300);
    await shot(page, "06-notes-detailed");
  }

  const actions = page.getByRole("button", { name: "Actions", exact: true });
  if (await actions.count()) {
    await actions.click();
    await page.waitForTimeout(300);
    await shot(page, "07-notes-actions");
  }

  // 08 Knowledge search
  await clickText(page, "Knowledge", true);
  await page.waitForTimeout(400);
  await shot(page, "08-knowledge-search");

  const library = page.getByRole("button", { name: "Library", exact: true });
  if (await library.count()) {
    await library.click();
    await page.waitForTimeout(300);
    await shot(page, "09-knowledge-library");
  }

  const add = page.getByRole("button", { name: "Add sources", exact: true });
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(300);
    await shot(page, "10-knowledge-add");
  }

  // 11 Resume inputs
  await clickText(page, "Resume", true);
  await page.waitForTimeout(500);
  await shot(page, "11-resume-inputs");

  // Upload + tailor for analysis/rewrite screens
  const upload = page.getByRole("button", { name: /Upload PDF or DOCX/i });
  if (await upload.count()) {
    await upload.click();
    await page.waitForTimeout(200);
  }
  await clickText(page, "Analyze & tailor resume");
  await page.waitForTimeout(1200);
  await shot(page, "12-resume-analysis");

  const review = page.getByRole("button", { name: /Review rewritten resume/i });
  if (await review.count()) {
    await review.click();
    await page.waitForTimeout(400);
    await shot(page, "13-resume-rewrite");
  }

  const compareStep = page.locator("button.resume-step", { hasText: "Compare" });
  if (await compareStep.count()) {
    await compareStep.click();
    await page.waitForTimeout(400);
    await shot(page, "14-resume-compare");
  }

  // 15 Privacy via Home quick card
  await clickText(page, "Home", true);
  await page.waitForTimeout(400);
  const privacyCard = page.getByRole("button", { name: /Privacy/i });
  await privacyCard.last().click();
  await page.waitForTimeout(500);
  await shot(page, "15-privacy-settings");

  await browser.close();
  console.log("Done →", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
