import { NextResponse } from "next/server";
import { z } from "zod";

import { validateNoLoginPlan } from "@/lib/public-policy";
import { runPublicPlan } from "@/lib/public-run";
import { evaluateRunWithCore, parseScenarioWithCore, planScenarioWithCore } from "@/lib/rust-core";
import type { RunConfiguration } from "@/lib/core-types";
import { validatePublicTargetUrl } from "@/lib/target-url";

export const runtime = "nodejs";

const requestSchema = z.object({
  scenarioYaml: z.string().min(1).max(200_000),
  baseline: z.url(),
  candidate: z.url(),
  inputs: z.record(z.string(), z.unknown()).default({}),
  configuration: z.object({
    comparison_mode: z.enum(["upgrade_differential", "client_differential", "control"]),
    baseline_protocol: z.string().nullable().optional(),
    candidate_protocol: z.string().nullable().optional(),
    baseline_client: z.string().nullable().optional(),
    candidate_client: z.string().nullable().optional(),
    baseline_state_fingerprint: z.string().nullable().optional(),
    candidate_state_fingerprint: z.string().nullable().optional(),
    control_reason: z.string().nullable().optional(),
    same_target: z.boolean(),
    allow_mode_override: z.boolean(),
    mode_override_reason: z.string().nullable().optional(),
    historical_fork_boundary: z.boolean(),
  }),
});
/** Execute a bounded public scenario. This route does not read or write user data. */
export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    for (const endpoint of [input.baseline, input.candidate]) {
      const error = await validatePublicTargetUrl(endpoint);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    const scenario = await parseScenarioWithCore(input.scenarioYaml);
    if (scenario.fuzz) return NextResponse.json({ error: "The no-login server runner does not run fuzz cases. Use the local CLI or DCEPT Cloud." }, { status: 400 });
    const configuration: RunConfiguration = {
      ...input.configuration,
      same_target: normalizeEndpoint(input.baseline) === normalizeEndpoint(input.candidate),
    };
    const plan = await planScenarioWithCore(input.scenarioYaml, input.inputs, configuration);
    const policyError = validateNoLoginPlan(plan);
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });
    return NextResponse.json(await runPublicPlan(
      plan,
      { endpoint: input.baseline, maxResponseBytes: 2_000_000 },
      { endpoint: input.candidate, maxResponseBytes: 2_000_000 },
      evaluateRunWithCore,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request is invalid.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
