import { NextResponse } from "next/server";
import { z } from "zod";

import { parseHostedScenario } from "@/lib/hosted-scenario";
import { runPublicScenario } from "@/lib/public-run";
import { validatePublicTargetUrl } from "@/lib/target-url";

export const runtime = "nodejs";

const requestSchema = z.object({
  scenarioYaml: z.string().min(1).max(200_000),
  baseline: z.url(),
  candidate: z.url(),
});
const unsafeMethod = /^(eth_send|eth_submit|eth_sign|personal_|wallet_|engine_|admin_|miner_|evm_|hardhat_|anvil_)/;

/** Execute a bounded public scenario. This route does not read or write user data. */
export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    for (const endpoint of [input.baseline, input.candidate]) {
      const error = await validatePublicTargetUrl(endpoint);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    const scenario = parseHostedScenario(input.scenarioYaml);
    if (scenario.actions.length > 20) return NextResponse.json({ error: "The no-login server runner allows up to 20 actions." }, { status: 400 });
    if (scenario.fuzz) return NextResponse.json({ error: "The no-login server runner does not run fuzz cases. Use the local CLI or GlamProbe Cloud." }, { status: 400 });
    const unsafeAction = scenario.actions.find((action) => action.kind === "rpc" && unsafeMethod.test(action.method));
    if (unsafeAction) return NextResponse.json({ error: `RPC method '${unsafeAction.method}' is not allowed in the no-login server runner.` }, { status: 400 });
    const unsafeHttpAction = scenario.actions.find((action) => action.kind === "http" && !["GET", "HEAD"].includes(action.method.toUpperCase()));
    if (unsafeHttpAction) return NextResponse.json({ error: `HTTP method '${unsafeHttpAction.method}' is not allowed in the no-login server runner.` }, { status: 400 });
    return NextResponse.json(await runPublicScenario(scenario, { endpoint: input.baseline }, { endpoint: input.candidate }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request is invalid.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
