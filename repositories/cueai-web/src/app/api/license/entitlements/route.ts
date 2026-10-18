import { licensingDisabledResponse } from "@/lib/server/licenses";

function entitlements() {
  return licensingDisabledResponse({
    plan: "pro",
    entitlements: {
      "meeting.full_summary": true,
      "meeting.max_questions": 999,
      desktop_companion: true,
    },
  });
}

export async function GET() {
  return Response.json(entitlements());
}

export async function POST() {
  return Response.json(entitlements());
}
