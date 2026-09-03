import { parse } from "yaml";
import { z } from "zod";

const comparison = z.object({
  ignore_paths: z.array(z.string()).default([]),
  numeric_tolerances: z.array(z.object({ path: z.string(), absolute: z.number().nonnegative() })).default([]),
}).default({ ignore_paths: [], numeric_tolerances: [] });
const assertion = z.object({
  path: z.string().refine((value) => value === "" || value.startsWith("/"), "Assertion path must be a JSON pointer."),
  equals: z.unknown().optional(), contains_all: z.array(z.unknown()).default([]), has_keys: z.array(z.string().min(1)).default([]),
}).refine((value) => Number(value.equals !== undefined) + Number(value.contains_all.length > 0) + Number(value.has_keys.length > 0) === 1, "An assertion needs exactly one of equals, contains_all, or has_keys.");
const expectations = z.object({ baseline: z.array(assertion).default([]), candidate: z.array(assertion).default([]) }).default({ baseline: [], candidate: [] });

const rpcAction = z.object({
  kind: z.literal("rpc"), id: z.string().min(1), method: z.string().min(1), params: z.unknown().default([]),
  baseline_params: z.unknown().optional(), candidate_params: z.unknown().optional(), comparison, expect: expectations,
});
const httpAction = z.object({
  kind: z.literal("http"), id: z.string().min(1), method: z.string().min(1), path: z.string().startsWith("/"),
  baseline_path: z.string().startsWith("/").optional(), candidate_path: z.string().startsWith("/").optional(),
  headers: z.record(z.string(), z.string()).default({}), body: z.unknown().optional(),
  baseline_body: z.unknown().optional(), candidate_body: z.unknown().optional(), comparison, expect: expectations,
});
const fuzzMutation = z.object({
  action: z.string().min(1), path: z.string().startsWith("/"),
  scope: z.enum(["both", "baseline", "candidate"]).default("both"), values: z.array(z.unknown()).min(1),
});
const fuzz = z.object({
  cases: z.number().int().positive().max(10_000).default(100), seed: z.number().int().nonnegative().default(0),
  mutations: z.array(fuzzMutation).min(1),
});
const probe = z.object({
  upgrade: z.string().min(1), eips: z.array(z.string().min(1)).min(1), category: z.string().min(1), risk: z.string().min(1),
  fixture_release: z.string().min(1).optional(), sources: z.array(z.url()).default([]),
});
const scenarioInput = z.object({
  description: z.string().min(1), kind: z.enum(["string", "address", "quantity", "block_tag", "json"]).default("string"),
  required: z.boolean().default(false), default: z.unknown().optional(),
});

export const hostedScenarioSchema = z.object({
  version: z.literal(1).default(1), name: z.string().min(1), description: z.string().optional(),
  probe: probe.optional(), inputs: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), scenarioInput).default({}),
  actions: z.array(z.discriminatedUnion("kind", [rpcAction, httpAction])).min(1),
  fuzz: fuzz.optional(),
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
  for (const mutation of parsed.fuzz?.mutations ?? []) {
    const action = parsed.actions.find((candidate) => candidate.id === mutation.action);
    if (!action) throw new Error(`Fuzz mutation references unknown action '${mutation.action}'.`);
    if (action.kind !== "rpc") throw new Error(`Fuzz mutation action '${mutation.action}' must be an RPC action.`);
  }
  return parsed;
}

/** Resolve local-only values before the browser or public route runs a probe. */
export function resolveHostedScenarioInputs(scenario: HostedScenario, supplied: Record<string, unknown>): HostedScenario {
  for (const name of Object.keys(supplied)) if (!(name in scenario.inputs)) throw new Error(`Input '${name}' is not declared by this scenario.`);
  const values: Record<string, unknown> = {};
  for (const [name, input] of Object.entries(scenario.inputs)) {
    const value = supplied[name] ?? input.default;
    if (value === undefined) {
      if (input.required) throw new Error(`Input '${name}' is required.`);
      continue;
    }
    validateInput(name, input.kind, value);
    values[name] = value;
  }
  const resolved = structuredClone(scenario);
  for (const action of resolved.actions) {
    if (action.kind === "rpc") {
      action.params = resolveValue(action.params, values);
      if (action.baseline_params !== undefined) action.baseline_params = resolveValue(action.baseline_params, values);
      if (action.candidate_params !== undefined) action.candidate_params = resolveValue(action.candidate_params, values);
    } else {
      action.path = resolveText(action.path, values);
      if (action.baseline_path !== undefined) action.baseline_path = resolveText(action.baseline_path, values);
      if (action.candidate_path !== undefined) action.candidate_path = resolveText(action.candidate_path, values);
      action.headers = Object.fromEntries(Object.entries(action.headers).map(([name, value]) => [name, resolveText(value, values)]));
      if (action.body !== undefined) action.body = resolveValue(action.body, values);
      if (action.baseline_body !== undefined) action.baseline_body = resolveValue(action.baseline_body, values);
      if (action.candidate_body !== undefined) action.candidate_body = resolveValue(action.candidate_body, values);
    }
  }
  resolved.inputs = {};
  return resolved;
}

function validateInput(name: string, kind: "string" | "address" | "quantity" | "block_tag" | "json", value: unknown) {
  const string = typeof value === "string";
  const quantity = string && /^0x[\da-f]+$/i.test(value);
  const valid = kind === "json" || kind === "string" && string || kind === "address" && string && /^0x[\da-f]{40}$/i.test(value)
    || kind === "quantity" && (typeof value === "number" || quantity)
    || kind === "block_tag" && string && (["latest", "safe", "finalized", "pending"].includes(value) || quantity);
  if (!valid) throw new Error(`Input '${name}' has an invalid ${kind} value.`);
}

function resolveValue(value: unknown, inputs: Record<string, unknown>): unknown {
  if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
    const name = value.slice(2, -2);
    if (!(name in inputs)) throw new Error(`Input '${name}' is not resolved.`);
    return structuredClone(inputs[name]);
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, inputs));
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, inputs)]));
  return value;
}

function resolveText(value: string, inputs: Record<string, unknown>): string {
  return value.replace(/{{([^}]+)}}/g, (_match, name: string) => {
    if (!(name in inputs)) throw new Error(`Input '${name}' is not resolved.`);
    if (typeof inputs[name] !== "string") throw new Error(`Input '${name}' must be a string in an HTTP path or header.`);
    return inputs[name];
  });
}
