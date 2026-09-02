import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, isResponse, requireSession } from "@/lib/api";
import { requireRole } from "@/lib/authorization";
import { database, newId } from "@/lib/db";
import { parseHostedScenario } from "@/lib/hosted-scenario";

const scenarioSchema = z.object({ name: z.string().trim().min(1).max(200), yamlSource: z.string().min(1).max(1_000_000) });

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const scenarios = await database()`SELECT id, name, checksum, created_at, updated_at FROM scenarios WHERE organization_id = ${session.organizationId} ORDER BY updated_at DESC`;
  return NextResponse.json({ scenarios });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const denied = await requireRole(session, ["owner", "admin", "member"]);
  if (denied) return denied;
  const parsed = scenarioSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Scenario name and YAML source are required.");
  try {
    parseHostedScenario(parsed.data.yamlSource);
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
