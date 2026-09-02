import { decrypt } from "./crypto";
import { compareJson } from "./compare";
import { database } from "./db";
import { parseHostedScenario, type HostedAction } from "./hosted-scenario";

type StoredRun = {
  status: string;
  organization_id: string;
  yaml_source: string;
  baseline_endpoint_ciphertext: string;
  baseline_headers_ciphertext: string;
  candidate_endpoint_ciphertext: string;
  candidate_headers_ciphertext: string;
  report_json: RunReport | null;
};

type Target = { endpoint: string; headers: Record<string, string> };
type Operation = { response: unknown | null; error: string | null; duration_ms: number };
export type RunReport = { schema_version: 1; scenario_name: string; actions: ActionReport[]; has_findings: boolean };
type ActionReport = { id: string; baseline: Operation; candidate: Operation; diffs: unknown[] };

export async function prepareRun(runId: string): Promise<{ actionCount: number; canceled: boolean }> {
  "use step";
  const run = await loadRun(runId);
  if (run.status === "canceled") return { actionCount: 0, canceled: true };
  await database()`UPDATE runs SET status = 'running', error_message = NULL WHERE id = ${runId} AND status = 'queued'`;
  return { actionCount: parseHostedScenario(run.yaml_source).actions.length, canceled: false };
}

export async function executeBatch(runId: string, startIndex: number): Promise<{ nextIndex: number; done: boolean; canceled: boolean }> {
  "use step";
  const run = await loadRun(runId);
  if (run.status === "canceled") return { nextIndex: startIndex, done: true, canceled: true };
  const scenario = parseHostedScenario(run.yaml_source);
  const baseline = targetFrom(run, "baseline");
  const candidate = targetFrom(run, "candidate");
  const report = run.report_json ?? { schema_version: 1, scenario_name: scenario.name, actions: [], has_findings: false };
  const end = Math.min(startIndex + 5, scenario.actions.length);

  for (let index = startIndex; index < end; index += 1) {
    report.actions[index] = await executeAction(scenario.actions[index], baseline, candidate);
  }
  report.has_findings = report.actions.some((action) => action.diffs.length > 0);
  await database()`UPDATE runs SET report_json = ${JSON.stringify(report)}::jsonb WHERE id = ${runId} AND status = 'running'`;
  return { nextIndex: end, done: end === scenario.actions.length, canceled: false };
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
    SELECT r.status, r.organization_id, r.report_json, s.yaml_source,
      baseline.endpoint_ciphertext AS baseline_endpoint_ciphertext,
      baseline.headers_ciphertext AS baseline_headers_ciphertext,
      candidate.endpoint_ciphertext AS candidate_endpoint_ciphertext,
      candidate.headers_ciphertext AS candidate_headers_ciphertext
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
    ? compareJson(baselineResult.response, candidateResult.response, action.comparison)
    : baselineResult.error === candidateResult.error ? [] : [{ path: "", kind: "value_mismatch", baseline: baselineResult, candidate: candidateResult }];
  return { id: action.id, baseline: baselineResult, candidate: candidateResult, diffs };
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
