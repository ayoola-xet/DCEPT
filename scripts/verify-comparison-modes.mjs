import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scenario = await readFile("examples/controlled-upgrade-differential.yaml", "utf8");

const stateFingerprint = `0x${"11".repeat(32)}`;
const controlledState = Object.freeze({
  sender: "0x0000000000000000000000000000000000000001",
  senderBalance: "0xde0b6b3a7640000",
  senderNonce: "0x0",
  recipient: "0x0000000000000000000000000000000000000002",
  recipientExists: true,
  recipientCode: "0x",
});
const baseline = await rpcServer("osaka", controlledState);
const candidate = await rpcServer("glamsterdam", controlledState);
const directory = await mkdtemp(join(tmpdir(), "dcept-modes-"));
const scenarioPath = join(directory, "scenario.yaml");
await writeFile(scenarioPath, scenario);

try {
  const baselineUrl = endpoint(baseline);
  const candidateUrl = endpoint(candidate);

  const controlDifference = await runReport([
    "--mode", "control",
    "--control-reason", "Verify that DCEPT detects a known difference.",
  ], baselineUrl, candidateUrl, 2);
  assert.equal(controlDifference.comparison_mode, "control");
  assert.equal(controlDifference.status, "findings");
  assert.equal(controlDifference.definitive_compatibility_claim, false);
  assert.match(controlDifference.mode_description, /Product\/self-test/);
  assert.match(controlDifference.warnings.join(" "), /not a controlled upgrade-differential result/);

  const sameInputControl = await runReport([
    "--mode", "control",
    "--control-reason", "Verify same-input matching behavior.",
  ], baselineUrl, baselineUrl, 0);
  assert.equal(sameInputControl.status, "matched");
  assert.equal(sameInputControl.has_findings, false);
  assert.match(sameInputControl.conclusion, /No protocol difference is claimed/);

  const inconclusive = await runReport([
    "--mode", "upgrade-differential",
    "--baseline-protocol", "osaka",
    "--candidate-protocol", "glamsterdam",
  ], baselineUrl, candidateUrl, 2);
  assert.equal(inconclusive.state_equivalence_status, "unverified");
  assert.equal(inconclusive.status, "inconclusive");
  assert.equal(inconclusive.definitive_compatibility_claim, false);
  assert.match(inconclusive.conclusion, /No protocol regression or compatibility failure is claimed/);

  const controlledUpgrade = await runReport([
    "--mode", "upgrade-differential",
    "--baseline-protocol", "osaka",
    "--candidate-protocol", "glamsterdam",
    "--baseline-state-fingerprint", stateFingerprint,
    "--candidate-state-fingerprint", stateFingerprint,
  ], baselineUrl, candidateUrl, 2);
  assert.equal(controlledUpgrade.state_equivalence_status, "verified");
  assert.equal(controlledUpgrade.status, "findings");
  assert.equal(controlledUpgrade.definitive_compatibility_claim, true);
  assert.equal(controlledUpgrade.baseline_protocol, "osaka");
  assert.equal(controlledUpgrade.candidate_protocol, "glamsterdam");
  assert.equal(controlledUpgrade.prepared_requests[1].baseline.params[0].value, "0x0");
  assert.deepEqual(controlledUpgrade.prepared_requests[1].baseline, controlledUpgrade.prepared_requests[1].candidate);
  assert.equal(controlledUpgrade.actions[0].diffs.length, 0);
  assert.equal(controlledUpgrade.actions[0].normalized_baseline.result.stateRoot, stateFingerprint);
  assert.equal(controlledUpgrade.actions[1].normalized_baseline.result, "0x5208");
  assert.equal(controlledUpgrade.actions[1].normalized_candidate.result, "0x3a98");
  assert.equal(controlledUpgrade.actions[1].diffs[0].path, "/result");
  assert.equal(controlledUpgrade.resolved_scenario.name, "controlled-pre-vs-post-glamsterdam");
  assert.match(controlledUpgrade.mode_description, /Baseline protocol behavior vs candidate protocol behavior/);

  const clientDifference = await runReport([
    "--mode", "client-differential",
    "--baseline-protocol", "glamsterdam",
    "--candidate-protocol", "glamsterdam",
    "--baseline-client", "geth",
    "--candidate-client", "reth",
    "--baseline-state-fingerprint", stateFingerprint,
    "--candidate-state-fingerprint", stateFingerprint,
  ], baselineUrl, candidateUrl, 2);
  assert.equal(clientDifference.comparison_mode, "client_differential");
  assert.match(clientDifference.mode_description, /Implementation consistency under equivalent protocol rules/);
  assert.doesNotMatch(clientDifference.mode_description, /pre-vs-post/);

  const rejected = await runCli([
    "run", scenarioPath,
    "--baseline", baselineUrl,
    "--candidate", baselineUrl,
    "--mode", "upgrade-differential",
    "--baseline-protocol", "glamsterdam",
    "--candidate-protocol", "glamsterdam",
  ]);
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /cannot use an identical target and protocol identity/);

  const overridden = await runReport([
    "--mode", "upgrade-differential",
    "--baseline-protocol", "glamsterdam",
    "--candidate-protocol", "glamsterdam",
    "--allow-mode-override",
    "--mode-override-reason", "Exercise mode protection in a controlled test.",
  ], baselineUrl, baselineUrl, 0);
  assert.equal(overridden.mode_override, true);
  assert.equal(overridden.status, "inconclusive");
  assert.match(overridden.warnings.join(" "), /overrode mode protection/);

  console.log("Comparison mode and controlled upgrade invariants passed.");
} finally {
  baseline.close();
  candidate.close();
  await rm(directory, { recursive: true, force: true });
}

async function rpcServer(protocol, state) {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body);
      const result = payload.method === "eth_getBlockByNumber"
        ? {
            hash: "0xcontrolled-genesis",
            stateRoot: stateFingerprint,
            state,
          }
        : estimateGas(protocol, state, payload.params?.[0]);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function estimateGas(protocol, state, transaction) {
  assert.equal(transaction?.from, state.sender);
  assert.equal(transaction?.to, state.recipient);
  assert.equal(transaction?.value, "0x0");
  assert.equal(state.recipientExists, true);
  assert.equal(state.recipientCode, "0x");

  if (protocol === "osaka") return hexQuantity(21_000);
  if (protocol === "glamsterdam") {
    const txBaseCost = 12_000;
    const coldAccountAccess = 3_000;
    return hexQuantity(txBaseCost + coldAccountAccess);
  }
  throw new Error(`Unsupported protocol ${protocol}`);
}

function hexQuantity(value) {
  return `0x${value.toString(16)}`;
}

function endpoint(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function runReport(modeArguments, baselineUrl, candidateUrl, expectedCode) {
  const result = await runCli([
    "run", scenarioPath,
    "--baseline", baselineUrl,
    "--candidate", candidateUrl,
    ...modeArguments,
  ]);
  assert.equal(result.code, expectedCode, result.stderr);
  return JSON.parse(result.stdout);
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
