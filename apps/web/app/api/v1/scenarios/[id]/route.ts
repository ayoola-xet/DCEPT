import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, hasScope, isResponse, requireSession } from "@/lib/api";
import { requireAccess } from "@/lib/authorization";
import { database, newId } from "@/lib/db";
import { parseScenarioWithCore } from "@/lib/rust-core";

type Context = { params: Promise<{ id: string }> };

const scenarioSchema = z.object({ name: z.string().trim().min(1).max(200), yamlSource: z.string().min(1).max(1_000_000) });

export async function GET(request: NextRequest, { params }: Context) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  if (!hasScope(session, "scenarios:read")) return NextResponse.json({ error: "API token does not have the required scope." }, { status: 403 });
  const { id } = await params;
  const rows = await database()`
    SELECT id, name, yaml_source, checksum, created_at, updated_at FROM scenarios
    WHERE id = ${id} AND organization_id = ${session.organizationId} LIMIT 1
  `;
  if (!rows[0]) return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  return NextResponse.json({ scenario: rows[0] });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await requireAccess(session, "scenarios:write", ["owner", "admin", "member"]);
  if (denied) return denied;
  const parsed = scenarioSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Scenario name and YAML source are required.");
  try {
    await parseScenarioWithCore(parsed.data.yamlSource);
  } catch (error) {
    return badRequest(error instanceof Error ? `Scenario YAML is invalid: ${error.message}` : "Scenario YAML is invalid.");
  }
  const { id } = await params;
  const checksum = createHash("sha256").update(parsed.data.yamlSource).digest("hex");
  try {
    const rows = await database()`
      UPDATE scenarios
      SET name = ${parsed.data.name}, yaml_source = ${parsed.data.yamlSource}, checksum = ${checksum}, updated_at = NOW()
      WHERE id = ${id} AND organization_id = ${session.organizationId}
      RETURNING id, name, checksum, updated_at
    `;
    if (!rows[0]) return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
    await database()`
      INSERT INTO audit_events (id, organization_id, user_id, event_type, metadata)
      VALUES (${newId()}, ${session.organizationId}, ${session.userId}, 'scenario.updated', ${JSON.stringify({ scenarioId: id, name: parsed.data.name, checksum })}::jsonb)
    `;
    return NextResponse.json({ scenario: rows[0] });
  } catch {
    return NextResponse.json({ error: "Scenario name already exists or could not be updated." }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await requireAccess(session, "scenarios:write", ["owner", "admin", "member"]);
  if (denied) return denied;
  const { id } = await params;
  const sql = database();
  const used = await sql`SELECT id FROM runs WHERE organization_id = ${session.organizationId} AND scenario_id = ${id} LIMIT 1`;
  if (used[0]) return NextResponse.json({ error: "Scenario cannot be deleted while a run references it." }, { status: 409 });
  const rows = await sql`DELETE FROM scenarios WHERE id = ${id} AND organization_id = ${session.organizationId} RETURNING id, name`;
  if (!rows[0]) return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  await sql`
    INSERT INTO audit_events (id, organization_id, user_id, event_type, metadata)
    VALUES (${newId()}, ${session.organizationId}, ${session.userId}, 'scenario.deleted', ${JSON.stringify({ scenarioId: id, name: rows[0].name })}::jsonb)
  `;
  return new NextResponse(null, { status: 204 });
}
