import { licensingDisabledResponse } from "@/lib/server/licenses";

export async function GET() {
  return Response.json(licensingDisabledResponse());
}
