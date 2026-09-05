import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { executePlannedAction, runPublicPlan } from "../apps/web/lib/public-run.ts";

const require = createRequire(import.meta.url);
const rust = require("../apps/web/lib/wasm/dcept.js");

const scenario = `version: 1
name: cross-path-conformance
actions:
  - kind: rpc
    id: echo
    method: test_echo
    params:
      - value: 0
    expect:
      baseline:
        - path: /result/valid
          equals: true
      candidate:
        - path: /result/valid
          equals: true
fuzz:
  cases: 5
  seed: 42
  mutations:
    - action: echo
      path: /0/value
      values: [1, 2, 3]
`;

const baseline = await rpcServer(true);
const candidate = await rpcServer(false);
const directory = await mkdtemp(join(tmpdir(), "dcept-conformance-"));
const scenarioPath = join(directory, "scenario.yaml");
await writeFile(scenarioPath, scenario);

try {
  const targets = {
    baseline: { endpoint: `http://127.0.0.1:${baseline.address().port}` },
    candidate: { endpoint: `http://127.0.0.1:${candidate.address().port}` },
  };
  const configuration = {
    comparison_mode: "control",
    baseline_protocol: null,
    candidate_protocol: null,
    baseline_client: null,
    candidate_client: null,
    baseline_state_fingerprint: null,
    candidate_state_fingerprint: null,
    control_reason: "Cross-path product self-test.",
    same_target: false,
    allow_mode_override: false,
    mode_override_reason: null,
    historical_fork_boundary: false,
  };
  const plan = rust.plan_configured_scenario(scenario, {}, configuration);

  const modeArguments = ["--mode", "control", "--control-reason", "Cross-path product self-test."];
  const cliRun = await runCli(["run", scenarioPath, "--baseline", targets.baseline.endpoint, "--candidate", targets.candidate.endpoint, ...modeArguments]);
  assert.equal(cliRun.code, 2, cliRun.stderr);
  const cliReport = JSON.parse(cliRun.stdout);

  const browserReport = await runPublicPlan(
    plan,
    targets.baseline,
    targets.candidate,
    (runPlan, executions, baselineName, candidateName) => rust.evaluate_run(runPlan, executions, baselineName, candidateName),
  );

  const cloudActions = [];
  for (const action of plan.actions) {
    const execution = await executePlannedAction(action, targets.baseline, targets.candidate);
    cloudActions.push(rust.evaluate_action(action, execution));
  }
  const cloudReport = rust.build_run_report(plan, cloudActions, "baseline", "candidate");

  assert.deepEqual(normalize(browserReport), normalize(cliReport));
  assert.deepEqual(normalize(cloudReport), normalize(cliReport));
  assert.equal(cliReport.actions[0].diffs.length, 1);
  assert.equal(cliReport.actions[0].assertion_failures.length, 1);

  const fuzzPlan = rust.plan_configured_fuzz(scenario, {}, {}, configuration);
  assert.deepEqual(fuzzPlan, rust.plan_configured_fuzz(scenario, {}, {}, configuration));
  const fuzzExecutions = [];
  for (const fuzzCase of fuzzPlan.cases) {
    const actions = [];
    for (const action of fuzzCase.plan.actions) {
      actions.push(await executePlannedAction(action, targets.baseline, targets.candidate));
    }
    fuzzExecutions.push({ index: fuzzCase.index, actions });
  }
  const cloudFuzzReport = rust.evaluate_fuzz(fuzzPlan, fuzzExecutions, "baseline", "candidate");
  const cliFuzz = await runCli(["fuzz", scenarioPath, "--baseline", targets.baseline.endpoint, "--candidate", targets.candidate.endpoint, ...modeArguments]);
  assert.equal(cliFuzz.code, 2, cliFuzz.stderr);
  assert.deepEqual(normalize(cloudFuzzReport), normalize(JSON.parse(cliFuzz.stdout)));
  assert.deepEqual(
    cloudFuzzReport.cases.map((fuzzCase) => fuzzCase.mutations),
    JSON.parse(cliFuzz.stdout).cases.map((fuzzCase) => fuzzCase.mutations),
  );

  console.log("CLI, browser host, and Cloud host conformance passed.");
} finally {
  baseline.close();
  candidate.close();
  await rm(directory, { recursive: true, force: true });
}

function rpcServer(valid) {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: payload.id,
        result: { echo: payload.params[0], valid },
      }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function runCli(args) {
  const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "dcept.exe" : "dcept");
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "duration_ms" ? 0 : normalize(item)]));
  }
  return value;
}
