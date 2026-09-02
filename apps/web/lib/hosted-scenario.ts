import { parse } from "yaml";
import { z } from "zod";

const comparison = z.object({
  ignore_paths: z.array(z.string()).default([]),
  numeric_tolerances: z.array(z.object({ path: z.string(), absolute: z.number().nonnegative() })).default([]),
}).default({ ignore_paths: [], numeric_tolerances: [] });

const rpcAction = z.object({
  kind: z.literal("rpc"), id: z.string().min(1), method: z.string().min(1), params: z.unknown().default([]),
  baseline_params: z.unknown().optional(), candidate_params: z.unknown().optional(), comparison,
});
const httpAction = z.object({
  kind: z.literal("http"), id: z.string().min(1), method: z.string().min(1), path: z.string().startsWith("/"),
  baseline_path: z.string().startsWith("/").optional(), candidate_path: z.string().startsWith("/").optional(),
  headers: z.record(z.string(), z.string()).default({}), body: z.unknown().optional(),
  baseline_body: z.unknown().optional(), candidate_body: z.unknown().optional(), comparison,
});

export const hostedScenarioSchema = z.object({
  version: z.literal(1).default(1), name: z.string().min(1), description: z.string().optional(),
  actions: z.array(z.discriminatedUnion("kind", [rpcAction, httpAction])).min(1),
});

export type HostedScenario = z.infer<typeof hostedScenarioSchema>;
export type HostedAction = HostedScenario["actions"][number];

export function parseHostedScenario(yamlSource: string): HostedScenario {
  const parsed = hostedScenarioSchema.parse(parse(yamlSource));
  const ids = new Set<string>();
  for (const action of parsed.actions) {
    if (ids.has(action.id)) throw new Error(`Action id '${action.id}' is duplicated.`);
    ids.add(action.id);
  }
  return parsed;
}
