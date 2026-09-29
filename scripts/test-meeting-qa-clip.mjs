/**
 * Smoke test for meeting Q&A clipping (mirrors clipMeetingAnswers).
 * Run: node scripts/test-meeting-qa-clip.mjs
 */
const FREE_LIMIT = 5;

function clipMeetingAnswers(answers, { role, plan }) {
  const admin = role === "Admin";
  const premium = plan === "premium" || plan === "pro" || plan === "business" || plan === "enterprise";
  const full = admin || premium;
  if (full) {
    return { answers, hasMore: false, fullSummaryAvailable: true };
  }
  const clipped = answers.slice(0, FREE_LIMIT);
  return {
    answers: clipped,
    hasMore: answers.length > clipped.length,
    fullSummaryAvailable: false,
  };
}

const six = [1, 2, 3, 4, 5, 6];
const free = clipMeetingAnswers(six, { role: "User", plan: "free" });
const premium = clipMeetingAnswers(six, { role: "User", plan: "premium" });
const admin = clipMeetingAnswers(six, { role: "Admin", plan: "free" });

const checks = [
  ["free answers.length", free.answers.length === 5],
  ["free hasMore", free.hasMore === true],
  ["free fullSummaryAvailable", free.fullSummaryAvailable === false],
  ["premium answers.length", premium.answers.length === 6],
  ["premium hasMore", premium.hasMore === false],
  ["premium fullSummaryAvailable", premium.fullSummaryAvailable === true],
  ["admin answers.length", admin.answers.length === 6],
  ["admin hasMore", admin.hasMore === false],
  ["admin fullSummaryAvailable", admin.fullSummaryAvailable === true],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error("FAIL", failed.map(([name]) => name));
  process.exit(1);
}
console.log("PASS meeting Q&A clip: free=5+hasMore, premium=all, admin=all");
