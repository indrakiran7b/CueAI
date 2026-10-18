import { NextRequest } from "next/server";
import { requirePermission, jsonError } from "@/lib/server/api-auth";

export async function GET(req: NextRequest) {
  const { error } = await requirePermission("licenses.read", req);
  if (error) return error;

  return Response.json({
    config: {
      signingReady: false,
      signingPrivateKey: false,
      signingPublicKey: false,
      offlineGraceHours: 0,
      enforcement: false,
      disabled: true,
    },
    licenses: [],
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requirePermission("licenses.write", req);
  if (error) return error;
  return jsonError("Licensing is disabled.", 410);
}

export async function DELETE(req: NextRequest) {
  const { error } = await requirePermission("licenses.write", req);
  if (error) return error;
  return jsonError("Licensing is disabled.", 410);
}
