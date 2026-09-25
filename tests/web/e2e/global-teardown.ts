import { access, readFile } from "node:fs/promises";
import { REPORT_JSON, writeMarkdownReport } from "./helpers/ai-providers";

export default async function globalTeardown() {
  try {
    await access(REPORT_JSON);
    const rows = JSON.parse(await readFile(REPORT_JSON, "utf8")) as unknown[];
    if (rows.length > 0) {
      await writeMarkdownReport();
    }
  } catch {
    // No AI provider report for this run.
  }
}
