import { decrypt } from "./crypto";
import { database } from "./db";
import { type HostedAction, type HostedScenario } from "./hosted-scenario";
import { compareWithCore, resolveScenarioWithCore } from "./rust-core";

type StoredRun = {
  status: string;
  organization_id: string;
  scenario_yaml_source: string;
  input_values: Record<string, unknown>;
  baseline_endpoint_ciphertext: string;
  baseline_headers_ciphertext: string;
  candidate_endpoint_ciphertext: string;
  candidate_headers_ciphertext: string;
  report_json: RunReport | null;
};

type Target = { endpoint: string; headers: Record<string, string> };
type Operation = { response: unknown | null; error: string | null; duration_ms: number };
export type RunReport = { schema_version: 1; scenario_name: string; probe?: HostedScenario["probe"]; actions: ActionReport[]; fuzz?: { seed: number; cases: FuzzCaseReport[] }; has_findings: boolean };
type AssertionFailure = { target: "baseline" | "candidate"; path: string; rule: "equals" | "contains_all" | "has_keys" | "is_hex_quantity"; expected: unknown; actual: unknown | null };
type ActionReport = { id: string; baseline: Operation; candidate: Operation; diffs: unknown[]; assertion_failures: AssertionFailure[] };
type FuzzCaseReport = { index: number; mutations: unknown[]; actions: ActionReport[]; has_findings: boolean };

export async function prepareRun(runId: string): Promise<{ actionCount: number; canceled: boolean }> {
  "use step";
  const run = await loadRun(runId);
  if (run.status === "canceled") return { actionCount: 0, canceled: true };
  await database()`UPDATE runs SET status = 'running', error_message = NULL WHERE id = ${runId} AND status = 'queued'`;
  const scenario = await resolvedScenario(run);
  return { actionCount: scenario.actions.length * (scenario.fuzz?.cases ?? 1), canceled: false };
}

export async function executeBatch(runId: string, startIndex: number): Promise<{ nextIndex: number; done: boolean; canceled: boolean }> {
  "use step";
  const run = await loadRun(runId);
  if (run.status === "canceled") return { nextIndex: startIndex, done: true, canceled: true };
  const scenario = await resolvedScenario(run);
  const baseline = targetFrom(run, "baseline");
  const candidate = targetFrom(run, "candidate");
  const fuzzCases = generatedCases(scenario);
  const actions = fuzzCases[0].scenario.actions;
  const report = run.report_json ?? initialReport(scenario, fuzzCases);
  const end = Math.min(startIndex + 5, actions.length * fuzzCases.length);

  for (let index = startIndex; index < end; index += 1) {
    const caseIndex = Math.floor(index / actions.length);
    const actionIndex = index % actions.length;
    const actionReport = await executeAction(fuzzCases[caseIndex].scenario.actions[actionIndex], baseline, candidate);
    if (report.fuzz) {
      const fuzzCase = report.fuzz.cases[caseIndex];
      fuzzCase.actions[actionIndex] = actionReport;
      fuzzCase.has_findings = fuzzCase.actions.some(hasFinding);
    } else {
      report.actions[actionIndex] = actionReport;
    }
  }
  report.has_findings = report.fuzz ? report.fuzz.cases.some((fuzzCase) => fuzzCase.has_findings) : report.actions.some(hasFinding);
  await database()`UPDATE runs SET report_json = ${JSON.stringify(report)}::jsonb WHERE id = ${runId} AND status = 'running'`;
  return { nextIndex: end, done: end === actions.length * fuzzCases.length, canceled: false };
}

export async function completeRun(runId: string): Promise<void> {
  "use step";
  await database()`UPDATE runs SET status = 'completed', completed_at = NOW() WHERE id = ${runId} AND status = 'running'`;
}

export async function failRun(runId: string, message: string): Promise<void> {
  "use step";
  await database()`UPDATE runs SET status = 'failed', error_message = ${message.slice(0, 2_000)}, completed_at = NOW() WHERE id = ${runId} AND status IN ('queued', 'running')`;
}

async function loadRun(runId: string): Promise<StoredRun> {
  const rows = await database()`
    SELECT r.status, r.organization_id, r.report_json,
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

async function resolvedScenario(run: StoredRun): Promise<HostedScenario> {
  return resolveScenarioWithCore(run.scenario_yaml_source, run.input_values ?? {});
}

function targetFrom(run: StoredRun, side: "baseline" | "candidate"): Target {
  return {
    endpoint: decrypt(run[`${side}_endpoint_ciphertext`]),
    headers: JSON.parse(decrypt(run[`${side}_headers_ciphertext`])) as Record<string, string>,
  };
}

async function executeAction(action: HostedAction, baseline: Target, candidate: Target): Promise<ActionReport> {
  const [baselineResult, candidateResult] = await Promise.all([
    executeOperation(action, baseline, "baseline"),
    executeOperation(action, candidate, "candidate"),
  ]);
  const diffs = baselineResult.response !== null && candidateResult.response !== null
    ? await compareWithCore(baselineResult.response, candidateResult.response, action.comparison)
    : baselineResult.error === candidateResult.error ? [] : [{ path: "", kind: "value_mismatch", baseline: baselineResult, candidate: candidateResult }];
  const assertion_failures = [
    ...evaluateAssertions("baseline", baselineResult, action.expect.baseline),
    ...evaluateAssertions("candidate", candidateResult, action.expect.candidate),
  ];
  return { id: action.id, baseline: baselineResult, candidate: candidateResult, diffs, assertion_failures };
}

async function executeOperation(action: HostedAction, target: Target, side: "baseline" | "candidate"): Promise<Operation> {
  const started = performance.now();
  try {
    let response: Response;
    if (action.kind === "rpc") {
      const params = side === "baseline" ? action.baseline_params ?? action.params : action.candidate_params ?? action.params;
      response = await fetch(target.endpoint, {
        method: "POST", headers: { "content-type": "application/json", ...target.headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: action.id, method: action.method, params }), signal: AbortSignal.timeout(30_000),
      });
    } else {
      const path = side === "baseline" ? action.baseline_path ?? action.path : action.candidate_path ?? action.path;
      const body = side === "baseline" ? action.baseline_body ?? action.body : action.candidate_body ?? action.body;
      response = await fetch(new URL(path, target.endpoint), {
        method: action.method, headers: { ...target.headers, ...action.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
      });
    }
    const text = await response.text();
    const body = tryJson(text);
    if (action.kind === "rpc" && !response.ok) throw new Error(`JSON-RPC endpoint returned HTTP ${response.status}: ${text.slice(0, 500)}`);
    return { response: action.kind === "rpc" ? body : { status: response.status, body }, error: null, duration_ms: Math.round(performance.now() - started) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return { response: null, error: message.replaceAll(target.endpoint, "<target>"), duration_ms: Math.round(performance.now() - started) };
  }
}

function tryJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

function hasFinding(action: ActionReport): boolean {
  return action.diffs.length > 0 || (action.assertion_failures?.length ?? 0) > 0;
}

function evaluateAssertions(
  target: "baseline" | "candidate",
  operation: Operation,
  assertions: HostedAction["expect"]["baseline"],
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  for (const assertion of assertions) {
    const actual = valueAtPointer(operation.response, assertion.path);
    if (assertion.equals !== undefined) {
      if (JSON.stringify(actual) !== JSON.stringify(assertion.equals)) failures.push({ target, path: assertion.path, rule: "equals", expected: assertion.equals, actual });
      continue;
    }
    for (const expected of assertion.contains_all) {
      const contains = Array.isArray(actual) ? actual.some((value) => JSON.stringify(value) === JSON.stringify(expected))
        : typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
      if (!contains) failures.push({ target, path: assertion.path, rule: "contains_all", expected, actual });
    }
    for (const expected of assertion.has_keys) {
      const contains = typeof actual === "object" && actual !== null && !Array.isArray(actual) && expected in actual;
      if (!contains) failures.push({ target, path: assertion.path, rule: "has_keys", expected, actual });
    }
    if (assertion.is_hex_quantity && !(typeof actual === "string" && /^0x[0-9a-fA-F]+$/.test(actual))) {
      failures.push({ target, path: assertion.path, rule: "is_hex_quantity", expected: true, actual });
    }
  }
  return failures;
}

function valueAtPointer(value: unknown | null, pointer: string): unknown | null {
  if (value === null) return null;
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) return null;
  let current: unknown = value;
  for (const token of pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (Array.isArray(current)) current = current[Number(token)];
    else if (typeof current === "object" && current !== null) current = (current as Record<string, unknown>)[token];
    else return null;
  }
  return current ?? null;
}

type GeneratedFuzzCase = { scenario: HostedScenario; mutations: unknown[] };

function generatedCases(scenario: HostedScenario): GeneratedFuzzCase[] {
  if (!scenario.fuzz) return [{ scenario, mutations: [] }];
  let state = scenario.fuzz.seed;
  return Array.from({ length: scenario.fuzz.cases }, () => {
    const copy = structuredClone(scenario);
    const mutations = scenario.fuzz!.mutations.map((mutation) => {
      state = (state * 1664525 + 1013904223) >>> 0;
      const value = structuredClone(mutation.values[state % mutation.values.length]);
      const action = copy.actions.find((candidate) => candidate.id === mutation.action);
      if (!action || action.kind !== "rpc") throw new Error(`Fuzz action '${mutation.action}' is invalid.`);
      const params = mutation.scope === "baseline" ? action.baseline_params ?? (action.baseline_params = structuredClone(action.params))
        : mutation.scope === "candidate" ? action.candidate_params ?? (action.candidate_params = structuredClone(action.params)) : action.params;
      replacePointer(params, mutation.path, value);
      return { action: mutation.action, scope: mutation.scope, path: mutation.path, value };
    });
    copy.fuzz = undefined;
    return { scenario: copy, mutations };
  });
}

function initialReport(scenario: HostedScenario, cases: GeneratedFuzzCase[]): RunReport {
  if (!scenario.fuzz) return { schema_version: 1, scenario_name: scenario.name, probe: scenario.probe, actions: [], has_findings: false };
  return { schema_version: 1, scenario_name: scenario.name, probe: scenario.probe, actions: [], has_findings: false, fuzz: {
    seed: scenario.fuzz.seed,
    cases: cases.map((fuzzCase, index) => ({ index, mutations: fuzzCase.mutations, actions: [], has_findings: false })),
  } };
}

function replacePointer(root: unknown, pointer: string, value: unknown) {
  const tokens = pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  const last = tokens.pop();
  if (!last) throw new Error("Fuzz mutation cannot replace the root params value.");
  let current: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(current)) current = current[Number(token)];
    else if (typeof current === "object" && current !== null) current = (current as Record<string, unknown>)[token];
    else throw new Error(`Fuzz path '${pointer}' does not exist.`);
  }
  if (Array.isArray(current)) {
    const index = Number(last); if (!Number.isInteger(index) || index < 0 || index >= current.length) throw new Error(`Fuzz path '${pointer}' does not exist.`);
    current[index] = value;
  } else if (typeof current === "object" && current !== null && last in current) {
    (current as Record<string, unknown>)[last] = value;
  } else throw new Error(`Fuzz path '${pointer}' does not exist.`);
}
