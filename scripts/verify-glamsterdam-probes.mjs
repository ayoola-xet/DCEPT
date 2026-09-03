import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";

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
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    });
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

const build = await run("cargo", ["build", "--quiet"]);
if (build.code !== 0) throw new Error(`Glamsterdam probe build failed. ${build.stderr}`);
await verify(requiredMethods, 0, 0);
await verify(["engine_newPayloadV4"], 2, requiredMethods.length * 2);
console.log("Glamsterdam Engine API probe invariant passed.");
