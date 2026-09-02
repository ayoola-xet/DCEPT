import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { badRequest, isResponse, requireSession } from "@/lib/api";
import { requireRole } from "@/lib/authorization";
import { database, newId } from "@/lib/db";
import { runScenarioWorkflow } from "@/workflows/run-scenario";

const runSchema = z.object({ scenarioId: z.string().uuid(), baselineTargetId: z.string().uuid(), candidateTargetId: z.string().uuid() });

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const runs = await database()`
    SELECT r.id, r.status, r.created_at, r.completed_at, r.error_message, s.name AS scenario_name,
      COALESCE(jsonb_array_length(r.report_json->'actions'), 0) AS action_count
    FROM runs r JOIN scenarios s ON s.id = r.scenario_id
    WHERE r.organization_id = ${session.organizationId}
    ORDER BY r.created_at DESC LIMIT 100
  `;
  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const denied = await requireRole(session, ["owner", "admin", "member"]);
  if (denied) return denied;
  const parsed = runSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Scenario, baseline target, and candidate target IDs are required.");
  if (parsed.data.baselineTargetId === parsed.data.candidateTargetId) return badRequest("Baseline and candidate targets must be different.");

  const sql = database();
  const resources = await sql`
    SELECT id FROM scenarios WHERE id = ${parsed.data.scenarioId} AND organization_id = ${session.organizationId}
    UNION ALL SELECT id FROM targets WHERE id = ${parsed.data.baselineTargetId} AND organization_id = ${session.organizationId}
    UNION ALL SELECT id FROM targets WHERE id = ${parsed.data.candidateTargetId} AND organization_id = ${session.organizationId}
  `;
  if (resources.length !== 3) return NextResponse.json({ error: "Scenario or target does not exist in this organization." }, { status: 404 });
  const id = newId();
  await sql`
    INSERT INTO runs (id, organization_id, scenario_id, baseline_target_id, candidate_target_id, status)
    VALUES (${id}, ${session.organizationId}, ${parsed.data.scenarioId}, ${parsed.data.baselineTargetId}, ${parsed.data.candidateTargetId}, 'queued')
  `;
  await start(runScenarioWorkflow, [id]);
  return NextResponse.json({ run: { id, status: "queued" } }, { status: 202 });
}
