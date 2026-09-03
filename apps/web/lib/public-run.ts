import type { HostedAction, HostedScenario } from "./hosted-scenario";

export type PublicTarget = { endpoint: string };
export type PublicOperation = { response: unknown | null; error: string | null; duration_ms: number };
export type PublicAssertionFailure = { target: "baseline" | "candidate"; path: string; rule: "equals" | "contains_all" | "has_keys" | "is_hex_quantity"; expected: unknown; actual: unknown | null };
export type PublicActionReport = { id: string; baseline: PublicOperation; candidate: PublicOperation; diffs: unknown[]; assertion_failures: PublicAssertionFailure[] };
export type PublicRunReport = { schema_version: 1; scenario_name: string; probe?: HostedScenario["probe"]; actions: PublicActionReport[]; has_findings: boolean };
export type Comparator = (baseline: unknown, candidate: unknown, comparison: HostedAction["comparison"]) => unknown[];

/** Run a normal scenario without user storage, login, or target credentials. */
export async function runPublicScenario(
  scenario: HostedScenario,
  baseline: PublicTarget,
  candidate: PublicTarget,
  comparator: Comparator,
): Promise<PublicRunReport> {
  if (scenario.fuzz) throw new Error("The no-login runner does not run fuzz cases. Use the local CLI or GlamProbe Cloud.");
  const credentialHeader = scenario.actions.find((action) => action.kind === "http" && Object.keys(action.headers).some(isCredentialHeader));
  if (credentialHeader) throw new Error(`Action '${credentialHeader.id}' includes a credential header. Use the local CLI or GlamProbe Cloud.`);

  const actions: PublicActionReport[] = [];
  for (const action of scenario.actions) {
    const [baselineResult, candidateResult] = await Promise.all([
      executeOperation(action, baseline, "baseline"),
      executeOperation(action, candidate, "candidate"),
    ]);
    const diffs = baselineResult.response !== null && candidateResult.response !== null
      ? comparator(baselineResult.response, candidateResult.response, action.comparison)
      : baselineResult.error === candidateResult.error
        ? []
        : [{ path: "", kind: "value_mismatch", baseline: baselineResult, candidate: candidateResult }];
    const assertion_failures = [
      ...evaluateAssertions("baseline", baselineResult, action.expect.baseline),
      ...evaluateAssertions("candidate", candidateResult, action.expect.candidate),
    ];
    actions.push({ id: action.id, baseline: baselineResult, candidate: candidateResult, diffs, assertion_failures });
  }
  return { schema_version: 1, scenario_name: scenario.name, probe: scenario.probe, actions, has_findings: actions.some((action) => action.diffs.length > 0 || action.assertion_failures.length > 0) };
}

async function executeOperation(action: HostedAction, target: PublicTarget, side: "baseline" | "candidate"): Promise<PublicOperation> {
  const started = performance.now();
  try {
    let response: Response;
    if (action.kind === "rpc") {
      const params = side === "baseline" ? action.baseline_params ?? action.params : action.candidate_params ?? action.params;
      response = await fetch(target.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: action.id, method: action.method, params }),
        signal: AbortSignal.timeout(30_000),
        redirect: "manual",
      });
    } else {
      const path = side === "baseline" ? action.baseline_path ?? action.path : action.candidate_path ?? action.path;
      const body = side === "baseline" ? action.baseline_body ?? action.body : action.candidate_body ?? action.body;
      response = await fetch(new URL(path, target.endpoint), {
        method: action.method,
        headers: { ...action.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
        redirect: "manual",
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

function isCredentialHeader(name: string): boolean {
  return /authorization|api[-_]?key|token|secret|cookie|credential|password/i.test(name);
}

function evaluateAssertions(
  target: "baseline" | "candidate",
  operation: PublicOperation,
  assertions: HostedAction["expect"]["baseline"],
): PublicAssertionFailure[] {
  const failures: PublicAssertionFailure[] = [];
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

function valueAtPointer(value: unknown, pointer: string): unknown | null {
  if (value === null || value === undefined) return null;
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
