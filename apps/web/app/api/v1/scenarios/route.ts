import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, hasScope, isResponse, requireSession } from "@/lib/api";
import { requireAccess } from "@/lib/authorization";
import { database, newId } from "@/lib/db";
import { parseScenarioWithCore } from "@/lib/rust-core";

const scenarioSchema = z.object({ name: z.string().trim().min(1).max(200), yamlSource: z.string().min(1).max(1_000_000) });

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  if (!hasScope(session, "scenarios:read")) return NextResponse.json({ error: "API token does not have the required scope." }, { status: 403 });
  const rows = await database()`SELECT id, name, checksum, created_at, updated_at, yaml_source FROM scenarios WHERE organization_id = ${session.organizationId} ORDER BY updated_at DESC`;
  const scenarios = await Promise.all(rows.map(async (row) => {
    const scenario = await parseScenarioWithCore(row.yaml_source as string);
    return {
      id: row.id,
      name: row.name,
      checksum: row.checksum,
      created_at: row.created_at,
      updated_at: row.updated_at,
      inputs: scenario.inputs,
    };
  }));
  return NextResponse.json({ scenarios });
}

export async function POST(request: NextRequest) {
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
  const checksum = createHash("sha256").update(parsed.data.yamlSource).digest("hex");
  const id = newId();
  try {
    await database()`
      INSERT INTO scenarios (id, organization_id, name, yaml_source, checksum)
      VALUES (${id}, ${session.organizationId}, ${parsed.data.name}, ${parsed.data.yamlSource}, ${checksum})
    `;
    return NextResponse.json({ scenario: { id, name: parsed.data.name, checksum } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Scenario name already exists or could not be saved." }, { status: 409 });
  }
}
