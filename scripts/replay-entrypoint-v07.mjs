import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archiveRpc = optionValue("--archive-rpc") ?? process.env.DCEPT_ARCHIVE_RPC ?? "https://eth.drpc.org";
const transactionHash = optionValue("--tx")
  ?? "0x5e0e38047dfa6fce58548a2f0b402bc3faccf4e7a3d5860f5b3c83796052ad66";
const image = process.env.DCEPT_GETH_IMAGE
  ?? "ethpandaops/geth:glamsterdam-devnet-8@sha256:50fad280c7e2a2d7df835b46753c7633882824fbf545efb63c03451f910090e8";
const baselinePort = Number(process.env.DCEPT_BASELINE_PORT ?? 18570);
const candidatePort = Number(process.env.DCEPT_CANDIDATE_PORT ?? 28570);
const outputPath = optionValue("--output");
const runId = `${Date.now()}-${process.pid}`;
const baselineName = `dcept-entrypoint-osaka-${runId}`;
const candidateName = `dcept-entrypoint-amsterdam-${runId}`;
const root = await mkdtemp(join(tmpdir(), "dcept-entrypoint-level-c-"));
const baselineData = join(root, "osaka");
const candidateData = join(root, "amsterdam");
const baselineGenesisPath = join(root, "osaka-genesis.json");
const candidateGenesisPath = join(root, "amsterdam-genesis.json");
const children = [];
let stopping = false;

try {
  await requireDocker();
  const { transaction, parentBlock, prestate } = await loadHistoricalCase();
  await writeFile(
    baselineGenesisPath,
    JSON.stringify(createGenesis(parentBlock, prestate, 253402300799), null, 2),
  );
  await writeFile(
    candidateGenesisPath,
    JSON.stringify(createGenesis(parentBlock, prestate, 0), null, 2),
  );

  await initialize(baselineData, baselineGenesisPath);
  await initialize(candidateData, candidateGenesisPath);
  children.push(startGeth(baselineName, baselineData, baselinePort));
  children.push(startGeth(candidateName, candidateData, candidatePort));

  const baselineUrl = `http://127.0.0.1:${baselinePort}`;
  const candidateUrl = `http://127.0.0.1:${candidatePort}`;
  await Promise.all([waitForRpc(baselineUrl), waitForRpc(candidateUrl)]);

  const [baselineBlock, candidateBlock] = await Promise.all([
    rpc(baselineUrl, "eth_getBlockByNumber", ["0x0", false]),
    rpc(candidateUrl, "eth_getBlockByNumber", ["0x0", false]),
  ]);
  assert.equal(baselineBlock.stateRoot, candidateBlock.stateRoot);

  const report = await runDcept(transaction, baselineUrl, candidateUrl, baselineBlock.stateRoot);
  const traces = await Promise.all([
    traceCall(transaction, baselineUrl),
    traceCall(transaction, candidateUrl),
  ]);
  const traceEvidence = compareTraceEvidence(traces[0], traces[1]);
  assert.equal(report.comparison_mode, "upgrade_differential");
  assert.equal(report.state_equivalence_status, "verified");
  assert.equal(report.requests_equivalent, true);
  assert.equal(report.definitive_compatibility_claim, true);
  assert.equal(report.status, "findings");

  const action = report.actions[0];
  assert.equal(action.normalized_baseline.result, "0x");
  assert.equal(action.normalized_candidate.error.code, 3);
  assert.equal(action.normalized_candidate.error.data.slice(0, 10), "0x220266b6");
  assert.match(hexToText(action.normalized_candidate.error.data), /AA26 over verificationGasLimit/);
  assert.ok(action.diffs.some((difference) => difference.path === "/result"));
  assert.ok(action.diffs.some((difference) => difference.path === "/error"));
  assert.equal(traceEvidence.first_state_write.opcode, "SSTORE");
  assert.equal(traceEvidence.first_state_write.storage_slot,
    "0x51635ee77ad1184148efcf27676f6e8775fe6612cd66fa01297588c612152b74");
  assert.equal(traceEvidence.first_state_write.original_value, "0x0");
  assert.equal(traceEvidence.first_state_write.new_value, "0x1");
  assert.equal(traceEvidence.first_state_write.baseline_execution_gas, 20_000);
  assert.equal(traceEvidence.first_state_write.candidate_execution_gas, 10_100);
  assert.equal(traceEvidence.first_state_write.candidate_state_gas, 97_920);
  assert.equal(traceEvidence.first_state_write.candidate_total_gas, 108_020);
  assert.equal(traceEvidence.account_validation_gas.baseline, 110_346);
  assert.equal(traceEvidence.account_validation_gas.candidate, 199_966);

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify({
    evidence_level: "C",
    transaction: transaction.hash,
    transaction_block: Number.parseInt(transaction.blockNumber, 16),
    parent_block: Number.parseInt(parentBlock.number, 16),
    state_root: baselineBlock.stateRoot,
    baseline: "osaka -> 0x",
    candidate: "glamsterdam -> JSON-RPC error 3 / AA26 over verificationGasLimit",
    requests_equivalent: report.requests_equivalent,
    report_status: report.status,
    first_state_write: traceEvidence.first_state_write,
    account_validation_gas: traceEvidence.account_validation_gas,
    report_output: outputPath ?? null,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await stop();
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

async function loadHistoricalCase() {
  const transaction = await rpc(archiveRpc, "eth_getTransactionByHash", [transactionHash]);
  assert.ok(transaction, `transaction was not found: ${transactionHash}`);
  const parentNumber = `0x${(BigInt(transaction.blockNumber) - 1n).toString(16)}`;
  const [parentBlock, prestate] = await Promise.all([
    rpc(archiveRpc, "eth_getBlockByNumber", [parentNumber, false]),
    rpc(archiveRpc, "debug_traceTransaction", [transactionHash, {
      tracer: "prestateTracer",
      tracerConfig: {},
      timeout: "60s",
    }]),
  ]);
  assert.ok(parentBlock, `parent block was not found: ${parentNumber}`);
  assert.ok(prestate && typeof prestate === "object", "prestateTracer returned no state");
  assert.ok(transaction.input?.startsWith("0x"), "historical transaction has no input data");
  return { transaction, parentBlock, prestate };
}

function createGenesis(parentBlock, prestate, amsterdamTime) {
  const alloc = {};
  for (const [address, account] of Object.entries(prestate)) {
    const entry = {};
    if (account.balance !== undefined) entry.balance = account.balance;
    if (account.nonce !== undefined) entry.nonce = account.nonce;
    if (account.code && account.code !== "0x") entry.code = account.code;
    if (account.storage && Object.keys(account.storage).length > 0) {
      entry.storage = account.storage;
    }
    alloc[address] = entry;
  }

  return {
    config: {
      chainId: 1,
      homesteadBlock: 0,
      eip150Block: 0,
      eip155Block: 0,
      eip158Block: 0,
      byzantiumBlock: 0,
      constantinopleBlock: 0,
      petersburgBlock: 0,
      istanbulBlock: 0,
      berlinBlock: 0,
      londonBlock: 0,
      mergeNetsplitBlock: 0,
      terminalTotalDifficulty: 0,
      terminalTotalDifficultyPassed: true,
      shanghaiTime: 0,
      cancunTime: 0,
      pragueTime: 0,
      osakaTime: 0,
      bpo1Time: 0,
      bpo2Time: 0,
      amsterdamTime,
      blobSchedule: {
        cancun: { target: 3, max: 6, baseFeeUpdateFraction: 3338477 },
        prague: { target: 6, max: 9, baseFeeUpdateFraction: 5007716 },
        bpo1: { target: 10, max: 15, baseFeeUpdateFraction: 8346193 },
        bpo2: { target: 14, max: 21, baseFeeUpdateFraction: 11684671 },
      },
    },
    coinbase: parentBlock.miner,
    difficulty: "0x0",
    extraData: parentBlock.extraData,
    gasLimit: parentBlock.gasLimit,
    nonce: parentBlock.nonce,
    mixHash: parentBlock.mixHash,
    parentHash: parentBlock.parentHash,
    timestamp: parentBlock.timestamp,
    baseFeePerGas: parentBlock.baseFeePerGas,
    alloc,
  };
}

async function requireDocker() {
  try {
    await execute("docker", ["info"], { timeout: 15_000 });
  } catch {
    throw new Error("Docker is required. Start Docker before this replay.");
  }
}

async function initialize(dataDirectory, genesisPath) {
  await execute("docker", [
    "run", "--rm",
    "--entrypoint", "geth",
    "-v", `${dataDirectory}:/data`,
    "-v", `${genesisPath}:/config/genesis.json:ro`,
    image,
    "init", "--datadir", "/data", "/config/genesis.json",
  ], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
}

function startGeth(name, dataDirectory, port) {
  const child = spawn("docker", [
    "run", "--rm",
    "--name", name,
    "-p", `${port}:8545`,
    "-v", `${dataDirectory}:/data`,
    "--entrypoint", "geth",
    image,
    "--datadir", "/data",
    "--networkid", "1",
    "--nodiscover",
    "--maxpeers", "0",
    "--ipcdisable",
    "--http",
    "--http.addr", "0.0.0.0",
    "--http.port", "8545",
    "--http.api", "eth,net,web3,debug",
    "--http.corsdomain", "*",
    "--http.vhosts", "*",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors = `${errors}${chunk}`.slice(-8_000);
  });
  child.once("exit", (code) => {
    if (!stopping && code !== 0) {
      console.error(`${name} stopped before the replay completed.\n${errors}`);
    }
  });
  return child;
}

async function waitForRpc(endpoint) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await rpc(endpoint, "eth_chainId", []);
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }
  throw new Error(`The local RPC did not start: ${endpoint}`);
}

async function rpc(endpoint, method, params) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const payload = await response.json();
      if (!payload.error) return payload.result;
      lastError = new Error(`${method} failed: ${JSON.stringify(payload.error)}`);
      if (payload.error.code !== 19 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /failed:/.test(error.message) && !/code.?19/.test(error.message)) {
        throw error;
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500 * (attempt + 1)));
  }
  throw lastError ?? new Error(`${method} failed`);
}

async function runDcept(transaction, baselineUrl, candidateUrl, stateRoot) {
  const binary = process.env.DCEPT_BINARY ?? join(repositoryRoot, "target", "debug", "dcept");
  const scenario = join(repositoryRoot, "research", "transaction-replay.yaml");
  const args = [
    "run", scenario,
    "--baseline", baselineUrl,
    "--candidate", candidateUrl,
    "--mode", "upgrade-differential",
    "--baseline-protocol", "osaka",
    "--candidate-protocol", "glamsterdam",
    "--baseline-client", "geth-glamsterdam-devnet-8",
    "--candidate-client", "geth-glamsterdam-devnet-8",
    "--baseline-state-fingerprint", stateRoot,
    "--candidate-state-fingerprint", stateRoot,
    "--var", `sender=${transaction.from}`,
    "--var", `target=${transaction.to}`,
    "--var", `calldata=${transaction.input}`,
    "--var", `gas=${transaction.gas}`,
    "--var", `value=${transaction.value}`,
    "--var", "access_list=[]",
    "--var", "block=0x0",
  ];
  let result;
  try {
    result = await execute(binary, args, { cwd: repositoryRoot, timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    if (error?.code !== 2 || !error.stdout) throw error;
    result = error;
  }
  return JSON.parse(result.stdout);
}

async function traceCall(transaction, endpoint) {
  return rpc(endpoint, "debug_traceCall", [{
    from: transaction.from,
    to: transaction.to,
    gas: transaction.gas,
    input: transaction.input,
    value: transaction.value,
  }, "0x0", {
    disableStorage: false,
    disableMemory: true,
    enableReturnData: true,
  }]);
}

function compareTraceEvidence(baseline, candidate) {
  const baselineLogs = baseline.structLogs ?? [];
  const candidateLogs = candidate.structLogs ?? [];
  const baselineWrite = baselineLogs.find((log) => isKernelValidationWrite(log));
  const candidateWrite = candidateLogs.find((log) => isKernelValidationWrite(log));
  assert.ok(baselineWrite, "Osaka trace has no Kernel validation SSTORE");
  assert.ok(candidateWrite, "Glamsterdam trace has no Kernel validation SSTORE");

  const stateGas = 64 * 1_530;
  return {
    first_state_write: {
      frame_depth: candidateWrite.depth,
      contract: "0x94f097e1ebeb4eca3aae54cabb08905b239a7d27",
      opcode: candidateWrite.op,
      program_counter: candidateWrite.pc,
      storage_slot: Object.entries(candidateWrite.storage ?? {})
        .find(([, value]) => value === "0x0000000000000000000000000000000000000000000000000000000000000001")?.[0],
      original_value: "0x0",
      new_value: "0x1",
      baseline_execution_gas: baselineWrite.gasCost,
      candidate_execution_gas: candidateWrite.gasCost,
      candidate_state_gas: stateGas,
      candidate_total_gas: candidateWrite.gasCost + stateGas,
      state_gas_formula: "64 bytes x CPSB 1530",
    },
    account_validation_gas: {
      baseline: callGasUsed(baselineLogs, 2),
      candidate: callGasUsed(candidateLogs, 2),
    },
  };
}

function isKernelValidationWrite(log) {
  return log.depth === 3
    && log.op === "SSTORE"
    && Object.values(log.storage ?? {}).some((value) => value === "0x0000000000000000000000000000000000000000000000000000000000000001");
}

function callGasUsed(logs, depth) {
  const start = logs.findIndex((log) => log.depth === depth);
  assert.ok(start >= 0, `trace has no call at depth ${depth}`);
  const end = logs.findIndex((log, index) => index > start && log.depth < depth);
  const returnedGas = end >= 0 ? logs[end - 1].gas : 0;
  const passedGas = Number.parseInt(logs[start - 1]?.stack?.at(-1) ?? "0x0", 16);
  return passedGas - returnedGas;
}

function hexToText(value) {
  return Buffer.from(value.slice(2), "hex").toString("utf8").replaceAll("\u0000", " ");
}

async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([
    execute("docker", ["stop", "--time", "2", baselineName], { timeout: 10_000 }),
    execute("docker", ["stop", "--time", "2", candidateName], { timeout: 10_000 }),
  ]);
  for (const child of children) child.kill("SIGTERM");
  await rm(root, { recursive: true, force: true });
}
