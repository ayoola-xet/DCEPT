import type { HostedAction, HostedScenario } from "./hosted-scenario";

type RustWasm = {
  compare_json: (baseline: unknown, candidate: unknown, comparison: HostedAction["comparison"]) => unknown;
  parse_scenario: (source: string) => unknown;
  resolve_scenario: (source: string, inputs: Record<string, unknown>) => unknown;
};

let core: Promise<RustWasm> | undefined;

async function loadCore(): Promise<RustWasm> {
  core ??= import(/* webpackIgnore: true */ "glamprobe") as Promise<RustWasm>;
  return core;
}

export async function parseScenarioWithCore(source: string): Promise<HostedScenario> {
  return (await loadCore()).parse_scenario(source) as HostedScenario;
}

export async function resolveScenarioWithCore(source: string, inputs: Record<string, unknown>): Promise<HostedScenario> {
  return (await loadCore()).resolve_scenario(source, inputs) as HostedScenario;
}

export async function compareWithCore(
  baseline: unknown,
  candidate: unknown,
  comparison: HostedAction["comparison"],
): Promise<unknown[]> {
  return (await loadCore()).compare_json(baseline, candidate, comparison) as unknown[];
}

export async function comparisonCore(): Promise<(baseline: unknown, candidate: unknown, comparison: HostedAction["comparison"]) => unknown[]> {
  const wasm = await loadCore();
  return (baseline, candidate, comparison) => wasm.compare_json(baseline, candidate, comparison) as unknown[];
}
