import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const verifyOnly = process.argv.includes("--verify");
const image = process.env.DCEPT_GETH_IMAGE
  ?? "ethpandaops/geth:glamsterdam-devnet-8@sha256:50fad280c7e2a2d7df835b46753c7633882824fbf545efb63c03451f910090e8";
const sender = "0x0000000000000000000000000000000000000001";
const recipient = "0x0000000000000000000000000000000000000002";
const baselinePort = Number(process.env.DCEPT_BASELINE_PORT ?? 18545);
const candidatePort = Number(process.env.DCEPT_CANDIDATE_PORT ?? 28545);
const runId = `${Date.now()}-${process.pid}`;
const baselineName = `dcept-osaka-${runId}`;
const candidateName = `dcept-amsterdam-${runId}`;
const root = await mkdtemp(join(tmpdir(), "dcept-geth-forks-"));
const baselineData = join(root, "osaka");
const candidateData = join(root, "amsterdam");
const baselineGenesis = join(root, "osaka-genesis.json");
const candidateGenesis = join(root, "amsterdam-genesis.json");
const children = [];
let stopping = false;

try {
  await requireDocker();
  await Promise.all([mkdir(baselineData), mkdir(candidateData)]);
  await writeFile(baselineGenesis, JSON.stringify(genesis(253_402_300_799), null, 2));
  await writeFile(candidateGenesis, JSON.stringify(genesis(0), null, 2));
  await initialize(baselineData, baselineGenesis);
  await initialize(candidateData, candidateGenesis);

  children.push(startGeth(baselineName, baselineData, baselinePort));
  children.push(startGeth(candidateName, candidateData, candidatePort));

  const baseline = `http://127.0.0.1:${baselinePort}`;
  const candidate = `http://127.0.0.1:${candidatePort}`;
  await Promise.all([waitForRpc(baseline), waitForRpc(candidate)]);

  const [baselineGenesisBlock, candidateGenesisBlock] = await Promise.all([
    rpc(baseline, "eth_getBlockByNumber", ["0x0", false]),
    rpc(candidate, "eth_getBlockByNumber", ["0x0", false]),
  ]);
  assert.equal(baselineGenesisBlock.stateRoot, candidateGenesisBlock.stateRoot);

  const transaction = { from: sender, to: recipient, value: "0x0" };
  const [baselineGas, candidateGas] = await Promise.all([
    rpc(baseline, "eth_estimateGas", [transaction, "0x0"]),
    rpc(candidate, "eth_estimateGas", [transaction, "0x0"]),
  ]);
  const [baselineAccessList, candidateAccessList] = await Promise.all([
    rpc(baseline, "eth_createAccessList", [transaction, "0x0"]),
    rpc(candidate, "eth_createAccessList", [transaction, "0x0"]),
  ]);
  const exactGasDelta = Number.parseInt(baselineAccessList.gasUsed, 16)
    - Number.parseInt(candidateAccessList.gasUsed, 16);
  assert.equal(exactGasDelta, 6_000);

  if (verifyOnly) {
    const report = await runDCEPT(
      baseline,
      candidate,
      baselineGenesisBlock.stateRoot,
    );
    assert.equal(report.comparison_mode, "upgrade_differential");
    assert.equal(report.state_equivalence_status, "verified");
    assert.equal(report.requests_equivalent, true);
    assert.equal(report.status, "findings");
    assert.equal(report.definitive_compatibility_claim, true);
    assert.equal(report.prepared_requests[1].baseline.params[0].value, "0x0");
    assert.deepEqual(report.prepared_requests[1].baseline, report.prepared_requests[1].candidate);
    assert.equal(
      report.actions[0].normalized_baseline.result.stateRoot,
      report.actions[0].normalized_candidate.result.stateRoot,
    );
    assert.ok(report.actions[0].diffs.every((difference) => difference.path !== "/result/stateRoot"));
    assert.equal(report.actions[1].normalized_baseline.result.gasUsed, baselineAccessList.gasUsed);
    assert.equal(report.actions[1].normalized_candidate.result.gasUsed, candidateAccessList.gasUsed);
    assert.equal(report.actions[2].normalized_baseline.result, baselineGas);
    assert.equal(report.actions[2].normalized_candidate.result, candidateGas);
    assert.notEqual(baselineGas, candidateGas);
    assert.ok(report.actions[1].diffs.some((difference) => difference.path === "/result/gasUsed"));
    console.log(
      `Controlled Geth fork differential passed: ${baselineAccessList.gasUsed} -> ${candidateAccessList.gasUsed} (6,000 gas).`,
    );
    await stop();
  } else {
    printInstructions({
      baseline,
      candidate,
      stateRoot: baselineGenesisBlock.stateRoot,
      baselineGas,
      candidateGas,
      baselineExactGas: baselineAccessList.gasUsed,
      candidateExactGas: candidateAccessList.gasUsed,
    });
    process.once("SIGINT", () => void stop(0));
    process.once("SIGTERM", () => void stop(0));
    await new Promise(() => {});
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  await stop();
  process.exitCode = 1;
}

function genesis(amsterdamTime) {
  return {
    config: {
      chainId: 7091047534,
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
        cancun: { target: 3, max: 6, baseFeeUpdateFraction: 3_338_477 },
        prague: { target: 6, max: 9, baseFeeUpdateFraction: 5_007_716 },
        bpo1: { target: 10, max: 15, baseFeeUpdateFraction: 8_346_193 },
        bpo2: { target: 14, max: 21, baseFeeUpdateFraction: 11_684_671 },
      },
    },
    coinbase: "0x0000000000000000000000000000000000000000",
    difficulty: "0x0",
    extraData: "",
    gasLimit: "0x3938700",
    nonce: "0x1234",
    mixhash: `0x${"00".repeat(32)}`,
    parentHash: `0x${"00".repeat(32)}`,
    timestamp: "0x0",
    alloc: {
      [sender.slice(2)]: { balance: "0x3635c9adc5dea00000", nonce: "0x0" },
      [recipient.slice(2)]: { balance: "0x1", nonce: "0x0" },
    },
  };
}

async function requireDocker() {
  try {
    await execute("docker", ["info"], { timeout: 15_000 });
  } catch {
    throw new Error("Docker is required. Start Docker before you run this lab.");
  }
}

async function initialize(dataDirectory, genesisPath) {
  await execute("docker", [
    "run", "--rm",
    ...dockerUserArguments(),
    "--entrypoint", "geth",
    "-v", `${dataDirectory}:/data`,
    "-v", `${genesisPath}:/config/genesis.json:ro`,
    image,
    "init", "--datadir", "/data", "/config/genesis.json",
  ], { timeout: 120_000 });
}

function startGeth(name, dataDirectory, port) {
  const child = spawn("docker", [
    "run", "--rm",
    ...dockerUserArguments(),
    "--name", name,
    "-p", `${port}:8545`,
    "-v", `${dataDirectory}:/data`,
    "--entrypoint", "geth",
    image,
    "--datadir", "/data",
    "--networkid", "7091047534",
    "--nodiscover",
    "--maxpeers", "0",
    "--ipcdisable",
    "--http",
    "--http.addr", "0.0.0.0",
    "--http.port", "8545",
    "--http.api", "eth,net,web3",
    "--http.corsdomain", "*",
    "--http.vhosts", "*",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors = `${errors}${chunk}`.slice(-8_000);
  });
  child.once("exit", (code) => {
    if (!stopping && code !== 0) {
      console.error(`${name} stopped before the test completed.\n${errors}`);
    }
  });
  return child;
}

function dockerUserArguments() {
  if (typeof process.getuid !== "function" || typeof process.getgid !== "function") return [];
  return ["--user", `${process.getuid()}:${process.getgid()}`];
}

async function waitForRpc(endpoint) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await rpc(endpoint, "eth_chainId", []);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`The local RPC did not start: ${endpoint}`);
}

async function rpc(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(`${method} failed: ${JSON.stringify(payload.error)}`);
  return payload.result;
}

async function runDCEPT(baseline, candidate, stateRoot) {
  const binary = join(
    process.cwd(),
    "target",
    "debug",
    process.platform === "win32" ? "dcept.exe" : "dcept",
  );
  try {
    await readFile(binary);
  } catch {
    throw new Error("Run cargo build before the controlled Geth verification.");
  }
  const { stdout, stderr } = await execute(binary, [
    "probe", "run", "glamsterdam/gas-repricing-estimate",
    "--baseline", baseline,
    "--candidate", candidate,
    "--mode", "upgrade-differential",
    "--baseline-protocol", "osaka",
    "--candidate-protocol", "glamsterdam",
    "--baseline-state-fingerprint", stateRoot,
    "--candidate-state-fingerprint", stateRoot,
    "--var", `sender=${sender}`,
    "--var", `recipient=${recipient}`,
    "--var", "block=0x0",
  ], { timeout: 120_000 }).catch((error) => {
    if (error.code === 2 && error.stdout) return error;
    throw error;
  });
  if (stderr) process.stderr.write(stderr);
  return JSON.parse(stdout);
}

function printInstructions({
  baseline,
  candidate,
  stateRoot,
  baselineGas,
  candidateGas,
  baselineExactGas,
  candidateExactGas,
}) {
  console.log("Controlled Glamsterdam fork lab is ready.");
  console.log(`Baseline Osaka RPC:       ${baseline}`);
  console.log(`Candidate Amsterdam RPC: ${candidate}`);
  console.log(`State fingerprint:        ${stateRoot}`);
  console.log(`Exact gas change:         ${baselineExactGas} -> ${candidateExactGas}`);
  console.log(`Estimate change:          ${baselineGas} -> ${candidateGas}`);
  console.log("");
  console.log("In the DCEPT UI:");
  console.log("1. Select Gas repricing estimates.");
  console.log("2. Select Upgrade differential.");
  console.log("3. Use the RPC endpoints shown above.");
  console.log("4. Set the protocols to osaka and glamsterdam.");
  console.log("5. Paste the same state fingerprint into both fields.");
  console.log(`6. Set sender to ${sender}.`);
  console.log(`7. Set recipient to ${recipient}.`);
  console.log("8. Set block to 0x0.");
  console.log("9. Select Browser as the execution host.");
  console.log("10. Run the differential test.");
  console.log("");
  console.log("Press Ctrl+C to stop both local clients.");
}

async function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([
    execute("docker", ["stop", "--time", "2", baselineName], { timeout: 10_000 }),
    execute("docker", ["stop", "--time", "2", candidateName], { timeout: 10_000 }),
  ]);
  for (const child of children) child.kill("SIGTERM");
  await rm(root, { recursive: true, force: true });
  if (typeof exitCode === "number") process.exit(exitCode);
}
