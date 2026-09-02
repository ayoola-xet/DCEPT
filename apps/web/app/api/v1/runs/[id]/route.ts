import { NextRequest, NextResponse } from "next/server";

import { hasScope, isResponse, requireSession } from "@/lib/api";
import { requireAccess } from "@/lib/authorization";
import { database } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  const session = await requireSession(_);
  if (isResponse(session)) return session;
  if (!hasScope(session, "runs:read")) return NextResponse.json({ error: "API token does not have the required scope." }, { status: 403 });
  const { id } = await params;
  const rows = await database()`
    SELECT id, status, created_at, completed_at, error_message, report_json FROM runs
    WHERE id = ${id} AND organization_id = ${session.organizationId} LIMIT 1
  `;
  if (!rows[0]) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({ run: rows[0] });
}

export async function DELETE(_: NextRequest, { params }: Context) {
  const session = await requireSession(_);
  if (isResponse(session)) return session;
  const denied = await requireAccess(session, "runs:write", ["owner", "admin", "member"]);
  if (denied) return denied;
  const { id } = await params;
  const result = await database()`
    UPDATE runs SET status = 'canceled', completed_at = NOW()
    WHERE id = ${id} AND organization_id = ${session.organizationId} AND status IN ('queued', 'running')
    RETURNING id
  `;
  if (!result[0]) return NextResponse.json({ error: "Run cannot be canceled." }, { status: 409 });
  return new NextResponse(null, { status: 204 });
}
