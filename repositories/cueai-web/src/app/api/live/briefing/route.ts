import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrDevice } from "@/lib/server/api-auth";
import { liveCorsHeaders, withLiveCors } from "@/lib/server/live-cors";
import { getLiveBriefing, saveLiveBriefing } from "@/lib/server/meetings";

const CORS_HEADERS = liveCorsHeaders("GET, PUT, OPTIONS");

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuthOrDevice(req);
  if (error || !session) return withLiveCors(error || NextResponse.json({ error: "Unauthorized" }, { status: 401 }), "GET, PUT, OPTIONS");

  const briefing = await getLiveBriefing(session);
  return NextResponse.json(
    {
      briefing,
      hasResume: Boolean(briefing?.resumeText?.trim()),
      resumeName: briefing?.resumeName || null,
    },
    { headers: CORS_HEADERS },
  );
}

export async function PUT(req: NextRequest) {
  const { error, session } = await requireAuthOrDevice(req);
  if (error || !session) return withLiveCors(error || NextResponse.json({ error: "Unauthorized" }, { status: 401 }), "GET, PUT, OPTIONS");

  const body = (await req.json().catch(() => null)) as
    | {
        kind?: "interview" | "regular";
        company?: string;
        jobDescription?: string;
        jobLink?: string;
        resumeName?: string;
        resumeText?: string;
        description?: string;
        documentIds?: string[];
        pendingKnowledgeIds?: string[];
        userId?: string;
        account_id?: string;
        workspaceId?: string;
      }
    | null;

  void body?.userId;
  void body?.account_id;
  void body?.workspaceId;

  const briefing = await saveLiveBriefing(
    {
      kind: body?.kind,
      company: body?.company,
      jobDescription: body?.jobDescription,
      jobLink: body?.jobLink,
      resumeName: body?.resumeName,
      resumeText: body?.resumeText,
      description: body?.description,
      documentIds: body?.documentIds,
      pendingKnowledgeIds: body?.pendingKnowledgeIds,
    },
    session,
  );

  return NextResponse.json(
    { briefing, hasResume: Boolean(briefing?.resumeText?.trim()) },
    { headers: CORS_HEADERS },
  );
}
