import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { badRequest, hasScope, isResponse, requireSession } from "@/lib/api";
import { requireAccess } from "@/lib/authorization";
import { database, newId } from "@/lib/db";
import { parseScenarioWithCore, planFuzzWithCore, planScenarioWithCore } from "@/lib/rust-core";
import { runScenarioWorkflow } from "@/workflows/run-scenario";
import type { RunConfiguration } from "@/lib/core-types";

const runSchema = z.object({
  scenarioId: z.string().uuid(),
  baselineTargetId: z.string().uuid(),
  candidateTargetId: z.string().uuid(),
  inputValues: z.record(z.string(), z.unknown()).default({}),
  comparisonMode: z.enum(["upgrade_differential", "client_differential", "control"]),
  baselineProtocol: z.string().optional(),
  candidateProtocol: z.string().optional(),
  baselineClient: z.string().optional(),
  candidateClient: z.string().optional(),
  baselineStateFingerprint: z.string().optional(),
  candidateStateFingerprint: z.string().optional(),
  controlReason: z.string().optional(),
  historicalForkBoundary: z.boolean().default(false),
  allowModeOverride: z.boolean().default(false),
  modeOverrideReason: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  if (!hasScope(session, "runs:read")) return NextResponse.json({ error: "API token does not have the required scope." }, { status: 403 });
  const runs = await database()`
    SELECT r.id, r.status, r.created_at, r.completed_at, r.error_message, s.name AS scenario_name,
      r.run_configuration->>'comparison_mode' AS comparison_mode,
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
  const sql = database();
  const scenarios = await sql`SELECT yaml_source FROM scenarios WHERE id = ${parsed.data.scenarioId} AND organization_id = ${session.organizationId} LIMIT 1`;
  const targets = await sql`
    SELECT id, endpoint_ciphertext, headers_ciphertext FROM targets
    WHERE organization_id = ${session.organizationId} AND id = ANY(${[parsed.data.baselineTargetId, parsed.data.candidateTargetId]})
  `;
  const expectedTargetCount = parsed.data.baselineTargetId === parsed.data.candidateTargetId ? 1 : 2;
  if (!scenarios[0] || targets.length !== expectedTargetCount) return NextResponse.json({ error: "Scenario or target does not exist in this organization." }, { status: 404 });
  const optional = (value: string | undefined) => value?.trim() || null;
  const configuration: RunConfiguration = {
    comparison_mode: parsed.data.comparisonMode,
    baseline_protocol: optional(parsed.data.baselineProtocol),
    candidate_protocol: optional(parsed.data.candidateProtocol),
    baseline_client: optional(parsed.data.baselineClient),
    candidate_client: optional(parsed.data.candidateClient),
    baseline_state_fingerprint: optional(parsed.data.baselineStateFingerprint),
    candidate_state_fingerprint: optional(parsed.data.candidateStateFingerprint),
    control_reason: optional(parsed.data.controlReason),
    same_target: parsed.data.baselineTargetId === parsed.data.candidateTargetId,
    allow_mode_override: parsed.data.allowModeOverride,
    mode_override_reason: optional(parsed.data.modeOverrideReason),
    historical_fork_boundary: parsed.data.historicalForkBoundary,
  };
  let caseCount: number;
  try {
    const source = scenarios[0].yaml_source as string;
    const scenario = await parseScenarioWithCore(source);
    if (scenario.fuzz) {
      caseCount = (await planFuzzWithCore(source, parsed.data.inputValues, configuration)).cases.length;
    } else {
      await planScenarioWithCore(source, parsed.data.inputValues, configuration);
      caseCount = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stored scenario YAML is invalid.";
    return NextResponse.json({ error: `Scenario inputs are invalid: ${message}` }, { status: 400 });
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
  const baseline = targets.find((target) => target.id === parsed.data.baselineTargetId);
  const candidate = targets.find((target) => target.id === parsed.data.candidateTargetId);
  if (!baseline || !candidate) return NextResponse.json({ error: "Scenario or target does not exist in this organization." }, { status: 404 });
  await sql`
    INSERT INTO runs (id, organization_id, scenario_id, baseline_target_id, candidate_target_id, baseline_endpoint_ciphertext, baseline_headers_ciphertext, candidate_endpoint_ciphertext, candidate_headers_ciphertext, scenario_yaml_source, input_values, run_configuration, case_count, status)
    VALUES (${id}, ${session.organizationId}, ${parsed.data.scenarioId}, ${parsed.data.baselineTargetId}, ${parsed.data.candidateTargetId}, ${baseline.endpoint_ciphertext as string}, ${baseline.headers_ciphertext as string}, ${candidate.endpoint_ciphertext as string}, ${candidate.headers_ciphertext as string}, ${scenarios[0].yaml_source as string}, ${JSON.stringify(parsed.data.inputValues)}::jsonb, ${JSON.stringify(configuration)}::jsonb, ${caseCount}, 'queued')
  `;
  await start(runScenarioWorkflow, [id]);
  return NextResponse.json({ run: { id, status: "queued" } }, { status: 202 });
}
