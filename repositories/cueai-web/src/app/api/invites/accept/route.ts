import { NextResponse } from "next/server";

/**
 * Accept-path invitation flow has been removed.
 * Users are added immediately by Admin invite and sign in via /login or /signup.
 */
export async function GET() {
  return NextResponse.json(
    {
      valid: false,
      error: "Invitation acceptance links are no longer used. Please sign in with your email.",
      loginPath: "/login",
      signupPath: "/signup",
    },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Invitation acceptance links are no longer used. Please sign in with your email.",
      loginPath: "/login",
      signupPath: "/signup",
    },
    { status: 410 },
  );
}
