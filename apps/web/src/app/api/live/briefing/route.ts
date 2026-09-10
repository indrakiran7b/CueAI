import { NextResponse } from "next/server";
import { getLiveBriefing, saveLiveBriefing } from "@/lib/server/meetings";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const briefing = await getLiveBriefing();
  return NextResponse.json(
    {
      briefing,
      hasResume: Boolean(briefing?.resumeText?.trim()),
      resumeName: briefing?.resumeName || null,
    },
    { headers: CORS_HEADERS },
  );
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        kind?: "interview" | "regular";
        company?: string;
        jobDescription?: string;
        jobLink?: string;
        resumeName?: string;
        resumeText?: string;
        description?: string;
      }
    | null;

  const briefing = await saveLiveBriefing({
    kind: body?.kind,
    company: body?.company,
    jobDescription: body?.jobDescription,
    jobLink: body?.jobLink,
    resumeName: body?.resumeName,
    resumeText: body?.resumeText,
    description: body?.description,
  });

  return NextResponse.json(
    { briefing, hasResume: Boolean(briefing?.resumeText?.trim()) },
    { headers: CORS_HEADERS },
  );
}
