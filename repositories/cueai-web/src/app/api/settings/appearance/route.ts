import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { readStore, updateStore } from "@/lib/server/db";
import { isPalettePreference, type PalettePreference } from "@/lib/themes";

const noStore = { "Cache-Control": "no-store" };

/** The signed-in user's own colour palette. `palette: null` means they have never chosen one. */
export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json(
    { palette: user.appearance?.palette ?? null, updatedAt: user.appearance?.updatedAt ?? null },
    { headers: noStore },
  );
}

/** Save the signed-in user's palette. Only the palette is touched; every other account field is left as is. */
export async function PUT(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { palette?: unknown } | null;
  if (!body || !isPalettePreference(body.palette)) {
    return NextResponse.json({ error: "Unknown theme." }, { status: 400 });
  }
  const palette: PalettePreference = body.palette;
  const updatedAt = new Date().toISOString();

  let found = false;
  await updateStore((s) => {
    const user = s.users.find((u) => u.id === session.userId);
    if (!user) return;
    user.appearance = { palette, updatedAt };
    found = true;
  });

  if (!found) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({ palette, updatedAt }, { headers: noStore });
}
