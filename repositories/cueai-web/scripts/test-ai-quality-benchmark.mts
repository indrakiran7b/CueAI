import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { analyzeQuestion } = await import("../src/lib/live-question");

const CASES = [
  ["REST versus SOAP", "Explain the difference between REST and SOAP. When would you choose one over the other?", "backend_api"],
  ["concurrent API", "An API becomes slow only under concurrent load. Explain how you would investigate the bottleneck and validate the fix.", "debugging"],
  ["production query", "A query is fast in development but slow in production. Explain your investigation process, including query plans, indexes, locking, and data volume.", "debugging"],
  ["tenant-safe RAG", "Design a reliable document-question-answering service that prevents one workspace from accessing another workspace's documents.", "system_design"],
  ["intermittent 500", "A backend endpoint returns HTTP 500 intermittently. What evidence would you collect before changing the code?", "backend_api"],
  ["BAPI RFC IDoc", "Explain the difference between BAPI, RFC, and IDoc, and when each is appropriate.", "sap_abap"],
  ["IDoc troubleshooting", "An IDoc remains in an error status in production. Describe your troubleshooting sequence and prevent duplicate processing.", "sap_abap"],
  ["slow ABAP", "Explain how you would investigate a slow ABAP report using internal tables, Open SQL, and runtime analysis.", "sap_abap"],
  ["SAP enhancements", "Explain user exits, customer exits, BAdIs, and enhancement points.", "sap_abap"],
  ["CDS performance", "A CDS view performs poorly. Investigate associations, filters, joins, and database execution.", "sap_abap"],
  ["resume project", "Explain one project from your resume, including architecture, your contribution, challenges, and result.", "project"],
  ["project decision", "Describe a technical decision in a project that you would change today.", "project"],
  ["difficult bug", "Tell me about a difficult bug you fixed and how you verified the solution.", "behavioral_hr"],
  ["deployment failure", "The project works locally but fails after deployment. Investigate configuration, dependencies, networking, and logs.", "project"],
  ["technology choice", "Why did you choose the technologies in your project instead of alternatives?", "project"],
  ["duplicates", "Write a program to find duplicate elements in an array.", "coding"],
  ["merge intervals", "Given intervals, merge all overlapping intervals and explain the time complexity.", "coding"],
  ["rate limiter", "Implement a thread-safe rate limiter including concurrency and edge cases.", "coding"],
  ["voice complete", "What is the difference between optimistic and pessimistic locking?", "technical_concept"],
  ["multi-sentence", "Our API times out under load. Explain how to isolate the cause. Then explain how to validate the fix.", "backend_api"],
] as const;

describe("critical 20-case deterministic routing", () => {
  for (const [name, question, category] of CASES) {
    it(`${name} routes to ${category}`, () => {
      assert.equal(analyzeQuestion(question).category, category);
    });
  }
});

describe("explicit programming language priority", () => {
  for (const language of ["Java", "Python", "C", "C++", "JavaScript", "SQL", "ABAP"]) {
    it(`uses ${language} when explicitly requested`, () => {
      const question =
        language === "SQL"
          ? "Using SQL, write a query to find duplicate emails."
          : language === "ABAP"
            ? "Using ABAP, write a report to find duplicate internal-table values."
            : `Using ${language}, write a program to find duplicate array elements.`;
      const analysis = analyzeQuestion(question);
      assert.equal(analysis.language, language);
      assert.equal(analysis.languageSource, "explicit");
    });
  }
});
