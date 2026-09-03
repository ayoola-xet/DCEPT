import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

const requiredMethods = [
  "engine_newPayloadV5",
  "engine_getPayloadV6",
  "engine_forkchoiceUpdatedV4",
  "engine_getPayloadBodiesByHashV2",
  "engine_getPayloadBodiesByRangeV2",
  "engine_getBlobsV4",
];

function rpcServer(result) {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body);
      response.setHeader("content-type", "application/json");
      const reply = typeof result === "function" ? result(payload) : { result };
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, ...reply }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function httpServer(status, onRequest = () => {}) {
  const server = createServer((request, response) => {
    onRequest(request);
    response.statusCode = status;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ status }));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function verify(capabilities, expectedExit, expectedAssertions) {
  const baseline = await rpcServer(capabilities);
  const candidate = await rpcServer(capabilities);
  try {
    const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "glamprobe.exe" : "glamprobe");
    const result = await run(binary, ["probe", "run", "glamsterdam/engine-api-surface", "--baseline", `http://127.0.0.1:${baseline.address().port}`, "--candidate", `http://127.0.0.1:${candidate.address().port}`]);
    if (result.code !== expectedExit) throw new Error(`Expected exit code ${expectedExit}. Got ${result.code}. ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    const failures = report.actions?.[0]?.assertion_failures ?? [];
    if (failures.length !== expectedAssertions) throw new Error(`Expected ${expectedAssertions} assertion failures. Got ${failures.length}.`);
    if (expectedAssertions > 0 && report.actions?.[0]?.diffs?.length !== 0) throw new Error("The capability test must fail through assertions, not target differences.");
  } finally {
    baseline.close();
    candidate.close();
  }
}

async function verifyBuilderStatus(status, expectedExit, expectedAssertions) {
  const baseline = await httpServer(status);
  const candidate = await httpServer(status);
  try {
    const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "glamprobe.exe" : "glamprobe");
    const result = await run(binary, ["probe", "run", "glamsterdam/gloas-builder-status", "--baseline", `http://127.0.0.1:${baseline.address().port}`, "--candidate", `http://127.0.0.1:${candidate.address().port}`]);
    if (result.code !== expectedExit) throw new Error(`Expected Builder API exit code ${expectedExit}. Got ${result.code}. ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    const failures = report.actions?.[0]?.assertion_failures ?? [];
    if (failures.length !== expectedAssertions) throw new Error(`Expected ${expectedAssertions} Builder API assertion failures. Got ${failures.length}.`);
  } finally {
    baseline.close();
    candidate.close();
  }
}

async function verifyPayloadBid(status, expectedExit, expectedAssertions) {
  const received = [];
  const capture = (request) => received.push({ path: request.url, consensusVersion: request.headers["eth-consensus-version"] });
  const baseline = await httpServer(status, capture);
  const candidate = await httpServer(status, capture);
  try {
    const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "glamprobe.exe" : "glamprobe");
    const slot = "123";
    const parentHash = "0xaaa";
    const parentRoot = "0xbbb";
    const proposerPubkey = "0xccc";
    const result = await run(binary, ["probe", "run", "glamsterdam/gloas-execution-payload-bid", "--baseline", `http://127.0.0.1:${baseline.address().port}`, "--candidate", `http://127.0.0.1:${candidate.address().port}`, "--var", `slot=${slot}`, "--var", `parent_hash=${parentHash}`, "--var", `parent_root=${parentRoot}`, "--var", `proposer_pubkey=${proposerPubkey}`]);
    if (result.code !== expectedExit) throw new Error(`Expected payload-bid exit code ${expectedExit}. Got ${result.code}. ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    const failures = report.actions?.[0]?.assertion_failures ?? [];
    if (failures.length !== expectedAssertions) throw new Error(`Expected ${expectedAssertions} payload-bid assertion failures. Got ${failures.length}.`);
    if (received.length !== 2) throw new Error("Payload-bid probe did not query both targets.");
    const expectedPath = `/eth/v1/builder/execution_payload_bid/${slot}/${parentHash}/${parentRoot}/${proposerPubkey}`;
    if (received.some((request) => request.path !== expectedPath || request.consensusVersion !== "gloas")) {
      throw new Error("Payload-bid probe did not send the required Gloas request path and header.");
    }
  } finally {
    baseline.close();
    candidate.close();
  }
}

async function verifyGasProbe(blockResult, expectedExit, expectedAssertions) {
  const reply = (payload) => {
    if (payload.method === "eth_getBlockByNumber") return { result: blockResult };
    if (payload.method === "eth_estimateGas") return { result: "0x5208" };
    return { error: { code: -32601, message: "method not found" } };
  };
  const baseline = await rpcServer(reply);
  const candidate = await rpcServer(reply);
  try {
    const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "glamprobe.exe" : "glamprobe");
    const result = await run(binary, ["probe", "run", "glamsterdam/gas-repricing-estimate", "--baseline", `http://127.0.0.1:${baseline.address().port}`, "--candidate", `http://127.0.0.1:${candidate.address().port}`, "--var", "sender=0x0000000000000000000000000000000000000001", "--var", "recipient=0x0000000000000000000000000000000000000002", "--var", "block=0x1234"]);
    if (result.code !== expectedExit) throw new Error(`Expected gas probe exit code ${expectedExit}. Got ${result.code}. ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    const failures = report.actions?.[0]?.assertion_failures ?? [];
    if (failures.length !== expectedAssertions) throw new Error(`Expected ${expectedAssertions} gas probe assertion failures. Got ${failures.length}.`);
    if (expectedAssertions > 0 && report.actions?.[0]?.diffs?.length !== 0) throw new Error("The gas probe preflight must fail through assertions, not target differences.");
  } finally {
    baseline.close();
    candidate.close();
  }
}

async function verifyFixtureReplay() {
  let baselineCalls = 0;
  let candidateCalls = 0;
  const fixtureReply = (counter) => (payload) => {
    if (payload.method !== "engine_newPayloadV5") return { error: { code: -32601, message: "method not found" } };
    counter.calls += 1;
    return counter.calls === 1 ? { result: { status: "VALID" } } : { error: { code: -32602, message: "invalid payload" } };
  };
  const baselineCounter = { calls: baselineCalls };
  const candidateCounter = { calls: candidateCalls };
  const baseline = await rpcServer(fixtureReply(baselineCounter));
  const candidate = await rpcServer(fixtureReply(candidateCounter));
  const directory = await mkdtemp(join(tmpdir(), "glamprobe-fixture-"));
  const fixture = join(directory, "fixture.json");
  await writeFile(fixture, JSON.stringify({
    valid_and_invalid: {
      engineNewPayloads: [
        { version: 5, executionPayload: { blockHash: "0x01" }, blobVersionedHashes: [], parentBeaconBlockRoot: "0x02", executionRequests: [] },
        { version: 5, executionPayload: { blockHash: "0x03" }, blobVersionedHashes: [], parentBeaconBlockRoot: "0x04", executionRequests: [], errorCode: -32602 },
      ],
    },
  }));
  try {
    const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "glamprobe.exe" : "glamprobe");
    const result = await run(binary, ["fixture", "run", fixture, "--case", "valid_and_invalid", "--baseline", `http://127.0.0.1:${baseline.address().port}`, "--candidate", `http://127.0.0.1:${candidate.address().port}`]);
    if (result.code !== 0) throw new Error(`Expected fixture replay to pass. Got ${result.code}. ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    if (report.actions.length !== 2 || report.has_findings) throw new Error("Fixture replay did not validate the ordered directives.");
    if (baselineCounter.calls !== 2 || candidateCounter.calls !== 2) throw new Error("Fixture replay did not deliver every directive to both targets.");
  } finally {
    baseline.close();
    candidate.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const build = await run("cargo", ["build", "--quiet"]);
if (build.code !== 0) throw new Error(`Glamsterdam probe build failed. ${build.stderr}`);
await verify(requiredMethods, 0, 0);
await verify(["engine_newPayloadV4"], 2, requiredMethods.length * 2);
await verifyBuilderStatus(200, 0, 0);
await verifyBuilderStatus(503, 2, 2);
await verifyPayloadBid(200, 0, 0);
await verifyPayloadBid(404, 2, 2);
await verifyGasProbe({ hash: "0x01", number: "0x1234" }, 0, 0);
await verifyGasProbe({}, 2, 4);
await verifyFixtureReplay();
console.log("Glamsterdam probe invariant passed.");
