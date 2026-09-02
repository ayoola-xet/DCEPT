import { NextRequest, NextResponse } from "next/server";

import { isResponse, requireSession } from "@/lib/api";
import { requireRole } from "@/lib/authorization";
import { database } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_: NextRequest, { params }: Context) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const denied = await requireRole(session, ["owner", "admin"]);
  if (denied) return denied;
  const { id } = await params;
  const result = await database()`
    UPDATE api_tokens SET revoked_at = NOW() WHERE id = ${id} AND organization_id = ${session.organizationId} AND revoked_at IS NULL RETURNING id
  `;
  if (!result[0]) return NextResponse.json({ error: "Token is not active." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
