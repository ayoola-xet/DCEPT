import type {
  ActionExecution,
  ActionPlan,
  ActionReport,
  FuzzCaseExecution,
  FuzzPlan,
  FuzzReport,
  RunPlan,
  RunConfiguration,
  RunReport,
  ScenarioView,
} from "./core-types";

export type RustCore = {
  parse_scenario: (source: string) => ScenarioView;
  plan_scenario: (source: string, inputs: Record<string, unknown>) => RunPlan;
  plan_configured_scenario: (source: string, inputs: Record<string, unknown>, configuration: RunConfiguration) => RunPlan;
  plan_fuzz: (source: string, inputs: Record<string, unknown>, overrides: { cases?: number; seed?: number }) => FuzzPlan;
  plan_configured_fuzz: (source: string, inputs: Record<string, unknown>, overrides: { cases?: number; seed?: number }, configuration: RunConfiguration) => FuzzPlan;
  evaluate_action: (plan: ActionPlan, execution: ActionExecution) => ActionReport;
  evaluate_run: (plan: RunPlan, executions: ActionExecution[], baselineTarget: string, candidateTarget: string) => RunReport;
  build_run_report: (plan: RunPlan, actions: ActionReport[], baselineTarget: string, candidateTarget: string) => RunReport;
  evaluate_fuzz: (plan: FuzzPlan, executions: FuzzCaseExecution[], baselineTarget: string, candidateTarget: string) => FuzzReport;
};

let core: Promise<RustCore> | undefined;

export function loadCore(): Promise<RustCore> {
  core ??= import(/* webpackIgnore: true */ "dcept") as Promise<RustCore>;
  return core;
}

export async function parseScenarioWithCore(source: string): Promise<ScenarioView> {
  return (await loadCore()).parse_scenario(source);
}

export async function planScenarioWithCore(
  source: string,
  inputs: Record<string, unknown>,
  configuration: RunConfiguration,
): Promise<RunPlan> {
  return (await loadCore()).plan_configured_scenario(source, inputs, configuration);
}

export async function planFuzzWithCore(
  source: string,
  inputs: Record<string, unknown>,
  configuration: RunConfiguration,
  overrides: { cases?: number; seed?: number } = {},
): Promise<FuzzPlan> {
  return (await loadCore()).plan_configured_fuzz(source, inputs, overrides, configuration);
}

export async function evaluateActionWithCore(plan: ActionPlan, execution: ActionExecution): Promise<ActionReport> {
  return (await loadCore()).evaluate_action(plan, execution);
}

export async function evaluateRunWithCore(
  plan: RunPlan,
  executions: ActionExecution[],
  baselineTarget = "baseline",
  candidateTarget = "candidate",
): Promise<RunReport> {
  return (await loadCore()).evaluate_run(plan, executions, baselineTarget, candidateTarget);
}

export async function buildRunReportWithCore(
  plan: RunPlan,
  actions: ActionReport[],
  baselineTarget = "baseline",
  candidateTarget = "candidate",
): Promise<RunReport> {
  return (await loadCore()).build_run_report(plan, actions, baselineTarget, candidateTarget);
}

export async function evaluateFuzzWithCore(
  plan: FuzzPlan,
  executions: FuzzCaseExecution[],
  baselineTarget = "baseline",
  candidateTarget = "candidate",
): Promise<FuzzReport> {
  return (await loadCore()).evaluate_fuzz(plan, executions, baselineTarget, candidateTarget);
}
