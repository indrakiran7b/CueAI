import { NextResponse } from "next/server";
import { listMeetings as listCatalog } from "@/lib/meetings-catalog";
import { parseDurationToSec, type StoredMeeting } from "@/lib/meetings-client";
import { getSessionFromRequest } from "@/lib/server/api-auth";
import { createMeeting, listMeetings, publicMeeting } from "@/lib/server/meetings";
import { sessionTitle, type LiveSessionKind } from "@/lib/live-session-config";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function catalogAsStored(item: ReturnType<typeof listCatalog>[number]): StoredMeeting {
  return {
    id: item.id,
    title: item.title,
    kind: "regular",
    status: item.status,
    startedAt: item.time,
    durationSec: parseDurationToSec(item.duration),
    attendees: item.attendees,
    tags: item.tags,
    transcript: [],
    answers: [],
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const stored = (await listMeetings()).map((meeting) => publicMeeting(meeting));
  const catalog = listCatalog()
    .filter((item) => !stored.some((meeting) => meeting.id === item.id))
    .map(catalogAsStored);

  return NextResponse.json(
    { meetings: [...stored, ...catalog] },
    { headers: CORS_HEADERS },
  );
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest();
  const body = (await req.json().catch(() => null)) as
    | {
        kind?: LiveSessionKind;
        title?: string;
        company?: string;
        jobDescription?: string;
        jobLink?: string;
        resumeName?: string;
        resumeText?: string;
        description?: string;
        tags?: string[];
      }
    | null;

  const kind: LiveSessionKind = body?.kind === "regular" ? "regular" : "interview";
  const title =
    body?.title?.trim() ||
    sessionTitle({
      kind,
      company: body?.company,
      callTitle: body?.title,
      documentScope: "all",
      guidance: "balanced",
      startMode: "private",
      autoAnswer: true,
    });

  const meeting = await createMeeting({
    title,
    kind,
    userId: session?.userId,
    company: body?.company,
    jobDescription: body?.jobDescription,
    jobLink: body?.jobLink,
    resumeName: body?.resumeName,
    resumeText: body?.resumeText,
    description: body?.description,
    tags: body?.tags,
  });

  return NextResponse.json({ meeting: publicMeeting(meeting, true) }, { headers: CORS_HEADERS });
}
