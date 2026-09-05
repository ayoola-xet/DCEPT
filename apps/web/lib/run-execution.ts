import type {
  ActionExecution,
  FuzzCaseExecution,
  FuzzPlan,
  RunConfiguration,
  RunPlan,
} from "./core-types";
import { decrypt } from "./crypto";
import { database } from "./db";
import { executePlannedAction, type TransportTarget } from "./public-run";
import {
  evaluateFuzzWithCore,
  evaluateRunWithCore,
  parseScenarioWithCore,
  planFuzzWithCore,
  planScenarioWithCore,
} from "./rust-core";
import { validatePublicTargetUrl } from "./target-url";

type StoredRun = {
  status: string;
  organization_id: string;
  scenario_yaml_source: string;
  input_values: Record<string, unknown>;
  baseline_endpoint_ciphertext: string;
  baseline_headers_ciphertext: string;
  candidate_endpoint_ciphertext: string;
  candidate_headers_ciphertext: string;
  report_json: unknown | null;
  run_configuration: RunConfiguration;
};

type RunProgress = {
  kind: "dcept_execution_progress";
  mode: "run";
  plan: RunPlan;
  actions: Array<ActionExecution | null>;
};

type FuzzProgress = {
  kind: "dcept_execution_progress";
  mode: "fuzz";
  plan: FuzzPlan;
  cases: Array<{ index: number; actions: Array<ActionExecution | null> }>;
};

type ExecutionProgress = RunProgress | FuzzProgress;

export async function prepareRun(runId: string): Promise<{ actionCount: number; canceled: boolean }> {
  "use step";
  const run = await loadRun(runId);
  if (run.status === "canceled") return { actionCount: 0, canceled: true };
  const scenario = await parseScenarioWithCore(run.scenario_yaml_source);
  const baseline = targetFrom(run, "baseline");
  const candidate = targetFrom(run, "candidate");
  await validateStoredTarget(baseline.endpoint);
  await validateStoredTarget(candidate.endpoint);
  const configuration: RunConfiguration = {
    ...run.run_configuration,
    same_target: normalizeEndpoint(baseline.endpoint) === normalizeEndpoint(candidate.endpoint),
  };
  const progress: ExecutionProgress = scenario.fuzz
    ? fuzzProgress(await planFuzzWithCore(run.scenario_yaml_source, run.input_values ?? {}, configuration))
    : runProgress(await planScenarioWithCore(run.scenario_yaml_source, run.input_values ?? {}, configuration));
  await database()`
    UPDATE runs
    SET status = 'running', error_message = NULL, report_json = ${JSON.stringify(progress)}::jsonb
    WHERE id = ${runId} AND status = 'queued'
  `;
  return { actionCount: progressActionCount(progress), canceled: false };
}

export async function executeBatch(runId: string, startIndex: number): Promise<{ nextIndex: number; done: boolean; canceled: boolean }> {
  "use step";
  const run = await loadRun(runId);
  if (run.status === "canceled") return { nextIndex: startIndex, done: true, canceled: true };
  const progress = executionProgress(run.report_json);
  const baseline = targetFrom(run, "baseline");
  const candidate = targetFrom(run, "candidate");
  await validateStoredTarget(baseline.endpoint);
  await validateStoredTarget(candidate.endpoint);
  const total = progressActionCount(progress);
  const end = Math.min(startIndex + 5, total);

  for (let index = startIndex; index < end; index += 1) {
    const slot = progressSlot(progress, index);
    slot.actions[slot.actionIndex] = await executePlannedAction(slot.plan.actions[slot.actionIndex], baseline, candidate);
  }
  await database()`UPDATE runs SET report_json = ${JSON.stringify(progress)}::jsonb WHERE id = ${runId} AND status = 'running'`;
  return { nextIndex: end, done: end === total, canceled: false };
}

export async function completeRun(runId: string): Promise<void> {
  "use step";
  const run = await loadRun(runId);
  const progress = executionProgress(run.report_json);
  const report = progress.mode === "run"
    ? await evaluateRunWithCore(progress.plan, completeActions(progress.actions), "baseline", "candidate")
    : await evaluateFuzzWithCore(
      progress.plan,
      progress.cases.map((fuzzCase): FuzzCaseExecution => ({ index: fuzzCase.index, actions: completeActions(fuzzCase.actions) })),
      "baseline",
      "candidate",
    );
  await database()`
    UPDATE runs
    SET status = 'completed', completed_at = NOW(), report_json = ${JSON.stringify(report)}::jsonb
    WHERE id = ${runId} AND status = 'running'
  `;
}

export async function failRun(runId: string, message: string): Promise<void> {
  "use step";
  await database()`UPDATE runs SET status = 'failed', error_message = ${message.slice(0, 2_000)}, completed_at = NOW() WHERE id = ${runId} AND status IN ('queued', 'running')`;
}

function runProgress(plan: RunPlan): RunProgress {
  return {
    kind: "dcept_execution_progress",
    mode: "run",
    plan,
    actions: Array.from({ length: plan.actions.length }, () => null),
  };
}

function fuzzProgress(plan: FuzzPlan): FuzzProgress {
  return {
    kind: "dcept_execution_progress",
    mode: "fuzz",
    plan,
    cases: plan.cases.map((fuzzCase) => ({
      index: fuzzCase.index,
      actions: Array.from({ length: fuzzCase.plan.actions.length }, () => null),
    })),
  };
}

function progressActionCount(progress: ExecutionProgress): number {
  return progress.mode === "run"
    ? progress.plan.actions.length
    : progress.plan.cases.reduce((total, fuzzCase) => total + fuzzCase.plan.actions.length, 0);
}

function progressSlot(progress: ExecutionProgress, flatIndex: number): {
  plan: RunPlan;
  actions: Array<ActionExecution | null>;
  actionIndex: number;
} {
  if (progress.mode === "run") return { plan: progress.plan, actions: progress.actions, actionIndex: flatIndex };
  let remaining = flatIndex;
  for (let caseIndex = 0; caseIndex < progress.plan.cases.length; caseIndex += 1) {
    const plan = progress.plan.cases[caseIndex].plan;
    if (remaining < plan.actions.length) {
      return { plan, actions: progress.cases[caseIndex].actions, actionIndex: remaining };
    }
    remaining -= plan.actions.length;
  }
  throw new Error(`Execution index ${flatIndex} is outside the Rust fuzz plan.`);
}

function completeActions(actions: Array<ActionExecution | null>): ActionExecution[] {
  if (actions.some((action) => action === null)) throw new Error("The host did not execute every Rust-planned action.");
  return actions as ActionExecution[];
}

function executionProgress(value: unknown): ExecutionProgress {
  if (!value || typeof value !== "object" || !("kind" in value) || value.kind !== "dcept_execution_progress") {
    throw new Error("The run does not contain Rust execution progress.");
  }
  return value as ExecutionProgress;
}

async function loadRun(runId: string): Promise<StoredRun> {
  const rows = await database()`
    SELECT r.status, r.organization_id, r.report_json, r.run_configuration,
      COALESCE(r.scenario_yaml_source, s.yaml_source) AS scenario_yaml_source,
      r.input_values,
      COALESCE(r.baseline_endpoint_ciphertext, baseline.endpoint_ciphertext) AS baseline_endpoint_ciphertext,
      COALESCE(r.baseline_headers_ciphertext, baseline.headers_ciphertext) AS baseline_headers_ciphertext,
      COALESCE(r.candidate_endpoint_ciphertext, candidate.endpoint_ciphertext) AS candidate_endpoint_ciphertext,
      COALESCE(r.candidate_headers_ciphertext, candidate.headers_ciphertext) AS candidate_headers_ciphertext
    FROM runs r
    JOIN scenarios s ON s.id = r.scenario_id AND s.organization_id = r.organization_id
    JOIN targets baseline ON baseline.id = r.baseline_target_id AND baseline.organization_id = r.organization_id
    JOIN targets candidate ON candidate.id = r.candidate_target_id AND candidate.organization_id = r.organization_id
    WHERE r.id = ${runId}
    LIMIT 1
  `;
  if (!rows[0]) throw new Error("Run does not exist.");
  return rows[0] as StoredRun;
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function targetFrom(run: StoredRun, side: "baseline" | "candidate"): TransportTarget {
  return {
    endpoint: decrypt(run[`${side}_endpoint_ciphertext`]),
    headers: JSON.parse(decrypt(run[`${side}_headers_ciphertext`])) as Record<string, string>,
    maxResponseBytes: 16_000_000,
  };
}

async function validateStoredTarget(endpoint: string): Promise<void> {
  const error = await validatePublicTargetUrl(endpoint);
  if (error) throw new Error(`Stored target is not safe to use: ${error}`);
}
