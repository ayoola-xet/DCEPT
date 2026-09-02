import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { badRequest, hasScope, isResponse, requireSession } from "@/lib/api";
import { requireAccess } from "@/lib/authorization";
import { database, newId } from "@/lib/db";
import { parseHostedScenario } from "@/lib/hosted-scenario";
import { runScenarioWorkflow } from "@/workflows/run-scenario";

const runSchema = z.object({ scenarioId: z.string().uuid(), baselineTargetId: z.string().uuid(), candidateTargetId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  if (!hasScope(session, "runs:read")) return NextResponse.json({ error: "API token does not have the required scope." }, { status: 403 });
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
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await requireAccess(session, "runs:write", ["owner", "admin", "member"]);
  if (denied) return denied;
  const parsed = runSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Scenario, baseline target, and candidate target IDs are required.");
  if (parsed.data.baselineTargetId === parsed.data.candidateTargetId) return badRequest("Baseline and candidate targets must be different.");

  const sql = database();
  const scenarios = await sql`SELECT yaml_source FROM scenarios WHERE id = ${parsed.data.scenarioId} AND organization_id = ${session.organizationId} LIMIT 1`;
  const targets = await sql`
    SELECT id FROM targets WHERE organization_id = ${session.organizationId} AND id = ANY(${[parsed.data.baselineTargetId, parsed.data.candidateTargetId]})
  `;
  if (!scenarios[0] || targets.length !== 2) return NextResponse.json({ error: "Scenario or target does not exist in this organization." }, { status: 404 });
  let caseCount: number;
  try {
    caseCount = parseHostedScenario(scenarios[0].yaml_source as string).fuzz?.cases ?? 1;
  } catch {
    return NextResponse.json({ error: "Stored scenario YAML is invalid." }, { status: 409 });
  }
  await sql`INSERT INTO organization_quotas (organization_id) VALUES (${session.organizationId}) ON CONFLICT (organization_id) DO NOTHING`;
  const usage = await sql`
    SELECT q.maximum_concurrent_runs, q.monthly_case_limit, COUNT(r.id)::integer AS active_runs
    FROM organization_quotas q
    LEFT JOIN runs r ON r.organization_id = q.organization_id AND r.status IN ('queued', 'running')
    WHERE q.organization_id = ${session.organizationId}
    GROUP BY q.maximum_concurrent_runs
  `;
  if (Number(usage[0]?.active_runs ?? 0) >= Number(usage[0]?.maximum_concurrent_runs ?? 0)) {
    return NextResponse.json({ error: "The organization has reached its concurrent run limit." }, { status: 429 });
  }
  const monthlyUsage = await sql`
    SELECT COALESCE(SUM(case_count), 0)::integer AS monthly_cases FROM runs
    WHERE organization_id = ${session.organizationId} AND created_at >= date_trunc('month', NOW())
  `;
  if (Number(monthlyUsage[0]?.monthly_cases ?? 0) + caseCount > Number(usage[0]?.monthly_case_limit ?? 0)) {
    return NextResponse.json({ error: "The organization has reached its monthly case limit." }, { status: 429 });
  }
  const id = newId();
  await sql`
    INSERT INTO runs (id, organization_id, scenario_id, baseline_target_id, candidate_target_id, case_count, status)
    VALUES (${id}, ${session.organizationId}, ${parsed.data.scenarioId}, ${parsed.data.baselineTargetId}, ${parsed.data.candidateTargetId}, ${caseCount}, 'queued')
  `;
  await start(runScenarioWorkflow, [id]);
  return NextResponse.json({ run: { id, status: "queued" } }, { status: 202 });
}
