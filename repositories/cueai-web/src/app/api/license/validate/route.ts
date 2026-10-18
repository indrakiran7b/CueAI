import { licensingDisabledResponse } from "@/lib/server/licenses";

export async function POST() {
  return Response.json(licensingDisabledResponse());
}
