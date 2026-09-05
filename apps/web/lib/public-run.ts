import type {
  ActionExecution,
  ActionPlan,
  OperationResult,
  RequestPlan,
  RunPlan,
  RunReport,
} from "./core-types";

export type TransportTarget = {
  endpoint: string;
  headers?: Record<string, string>;
  maxResponseBytes?: number;
};

export type RunEvaluator = (
  plan: RunPlan,
  executions: ActionExecution[],
  baselineTarget: string,
  candidateTarget: string,
) => RunReport | Promise<RunReport>;

/** Perform only host network I/O. Rust owns planning and evaluation. */
export async function runPublicPlan(
  plan: RunPlan,
  baseline: TransportTarget,
  candidate: TransportTarget,
  evaluator: RunEvaluator,
): Promise<RunReport> {
  const executions: ActionExecution[] = [];
  for (const action of plan.actions) {
    executions.push(await executePlannedAction(action, baseline, candidate));
  }
  return evaluator(plan, executions, "baseline", "candidate");
}

export async function executePlannedAction(
  action: ActionPlan,
  baseline: TransportTarget,
  candidate: TransportTarget,
): Promise<ActionExecution> {
  const [baselineResult, candidateResult] = await Promise.all([
    executeRequest(action.id, action.baseline, baseline),
    executeRequest(action.id, action.candidate, candidate),
  ]);
  return { id: action.id, baseline: baselineResult, candidate: candidateResult };
}

async function executeRequest(
  actionId: string,
  request: RequestPlan,
  target: TransportTarget,
): Promise<OperationResult> {
  const started = performance.now();
  try {
    let response: Response;
    if (request.kind === "rpc") {
      response = await fetch(target.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...target.headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: actionId, method: request.method, params: request.params }),
        signal: AbortSignal.timeout(30_000),
        redirect: "manual",
      });
    } else {
      response = await fetch(resolveTargetRequestUrl(request.path, target.endpoint), {
        method: request.method,
        headers: { ...target.headers, ...request.headers, ...(request.body === undefined ? {} : { "content-type": "application/json" }) },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(30_000),
        redirect: "manual",
      });
    }
    const text = await readResponseText(response, target.maxResponseBytes);
    const body = tryJson(text);
    if (request.kind === "rpc" && !response.ok) throw new Error(`JSON-RPC endpoint returned HTTP ${response.status}: ${text.slice(0, 500)}`);
    return {
      response: request.kind === "rpc" ? body : { status: response.status, body },
      error: null,
      duration_ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return {
      response: null,
      error: message.split(target.endpoint).join("<target>"),
      duration_ms: Math.round(performance.now() - started),
    };
  }
}

export function resolveTargetRequestUrl(path: string, endpoint: string): URL {
  const target = new URL(endpoint);
  const request = new URL(path, target);
  if (request.origin !== target.origin) {
    throw new Error("The HTTP action path cannot change the target host.");
  }
  return request;
}

async function readResponseText(response: Response, maximumBytes?: number): Promise<string> {
  if (!maximumBytes) return response.text();
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
    throw new Error(`Response body exceeds the ${maximumBytes}-byte limit.`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error(`Response body exceeds the ${maximumBytes}-byte limit.`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
