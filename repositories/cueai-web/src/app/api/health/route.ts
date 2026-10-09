import { NextResponse } from "next/server";

/** Process liveness for compose/load balancers. Does not check Redis, Qdrant, or LLM keys. */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
