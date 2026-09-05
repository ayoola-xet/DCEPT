import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, hasScope, isResponse, requireSession } from "@/lib/api";
import { requireAccess } from "@/lib/authorization";
import { encrypt } from "@/lib/crypto";
import { database, newId } from "@/lib/db";
import { validatePublicTargetUrl } from "@/lib/target-url";

type Context = { params: Promise<{ id: string }> };

const targetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  endpointUrl: z.url(),
  headers: z.record(z.string().max(200), z.string().max(4_000)).default({}),
});

/** Return target metadata only. Endpoint credentials never leave the server. */
export async function GET(request: NextRequest, { params }: Context) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  if (!hasScope(session, "targets:read")) return NextResponse.json({ error: "API token does not have the required scope." }, { status: 403 });
  const { id } = await params;
  const rows = await database()`
    SELECT id, name, created_at FROM targets
    WHERE id = ${id} AND organization_id = ${session.organizationId} LIMIT 1
  `;
  if (!rows[0]) return NextResponse.json({ error: "Target not found." }, { status: 404 });
  return NextResponse.json({ target: rows[0] });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await requireAccess(session, "targets:write", ["owner", "admin", "member"]);
  if (denied) return denied;
  const parsed = targetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Target name, HTTPS endpoint URL, and string headers are required.");
  const targetUrlError = await validatePublicTargetUrl(parsed.data.endpointUrl);
  if (targetUrlError) return badRequest(targetUrlError);
  const { id } = await params;
  try {
    const rows = await database()`
      UPDATE targets
      SET name = ${parsed.data.name}, endpoint_ciphertext = ${encrypt(parsed.data.endpointUrl)}, headers_ciphertext = ${encrypt(JSON.stringify(parsed.data.headers))}
      WHERE id = ${id} AND organization_id = ${session.organizationId}
      RETURNING id, name
    `;
    if (!rows[0]) return NextResponse.json({ error: "Target not found." }, { status: 404 });
    await database()`
      INSERT INTO audit_events (id, organization_id, user_id, event_type, metadata)
      VALUES (${newId()}, ${session.organizationId}, ${session.userId}, 'target.updated', ${JSON.stringify({ targetId: id, name: parsed.data.name })}::jsonb)
    `;
    return NextResponse.json({ target: rows[0] });
  } catch {
    return NextResponse.json({ error: "Target name already exists or could not be updated." }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await requireAccess(session, "targets:write", ["owner", "admin", "member"]);
  if (denied) return denied;
  const { id } = await params;
  const sql = database();
  const used = await sql`
    SELECT id FROM runs
    WHERE organization_id = ${session.organizationId} AND (baseline_target_id = ${id} OR candidate_target_id = ${id})
    LIMIT 1
  `;
  if (used[0]) return NextResponse.json({ error: "Target cannot be deleted while a run references it." }, { status: 409 });
  const rows = await sql`DELETE FROM targets WHERE id = ${id} AND organization_id = ${session.organizationId} RETURNING id, name`;
  if (!rows[0]) return NextResponse.json({ error: "Target not found." }, { status: 404 });
  await sql`
    INSERT INTO audit_events (id, organization_id, user_id, event_type, metadata)
    VALUES (${newId()}, ${session.organizationId}, ${session.userId}, 'target.deleted', ${JSON.stringify({ targetId: id, name: rows[0].name })}::jsonb)
  `;
  return new NextResponse(null, { status: 204 });
}
