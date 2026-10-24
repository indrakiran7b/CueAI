import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { appendAudit, readStore, updateStore, type DbUser } from "@/lib/server/db";
import { validateProfileUpdate } from "@/lib/professional-profile";

function payload(user: DbUser) {
  return {
    name: user.name,
    email: user.email,
    accessRole: user.role,
    profile: user.professionalProfile || {},
  };
}

/** The signed-in user's own profile. There is no way to read another user's profile here. */
export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json(payload(user), { headers: { "Cache-Control": "no-store" } });
}

/** Update the signed-in user's name and professional details. Email is the sign-in identity and is not editable here. */
export async function PUT(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; profile?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = validateProfileUpdate(body);
  if ("errors" in result) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: result.errors },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  let saved: DbUser | null = null;
  await updateStore(async (s) => {
    const user = s.users.find((u) => u.id === session.userId);
    if (!user) return;
    const firstTime = !user.professionalProfile;
    user.name = result.name;
    user.professionalProfile = { ...result.profile, updatedAt: now };
    saved = user;

    await appendAudit(s, {
      actorId: user.id,
      actorName: user.name,
      action: firstTime ? "user.profile_created" : "user.profile_updated",
      resourceType: "user",
      resourceId: user.id,
      metadata: { fields: Object.keys(result.profile).join(",") },
      workspaceId: user.workspaceId,
    });
  });

  if (!saved) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json(payload(saved));
}
