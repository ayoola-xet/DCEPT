import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const baseline = await rpcServer("0x1");
const candidate = await rpcServer("0x2");
const directory = await mkdtemp(join(tmpdir(), "dcept-local-"));
const scenario = join(directory, "scenario.yaml");
const report = join(directory, "report.json");

try {
  await writeFile(scenario, "version: 1\nname: local-invariant\nactions:\n  - kind: rpc\n    id: chain-id\n    method: eth_chainId\n    params: []\n");
  const baselineUrl = `http://127.0.0.1:${baseline.address().port}`;
  const candidateUrl = `http://127.0.0.1:${candidate.address().port}`;
  const build = await run("cargo", ["build", "--quiet"]);
  if (build.code !== 0) throw new Error(`Standalone build failed. ${build.stderr}`);
  const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "dcept.exe" : "dcept");
  const result = await run(binary, ["run", scenario, "--baseline", baselineUrl, "--candidate", candidateUrl, "--output", report]);
  if (result.code !== 2) throw new Error(`Expected differential exit code 2. Got ${result.code}. ${result.stderr}`);
  const parsed = JSON.parse(await readFile(report, "utf8"));
  if (!parsed.has_findings || parsed.actions?.[0]?.diffs?.[0]?.path !== "/result") throw new Error("The local differential report does not contain the expected result difference.");
  console.log("Local standalone invariant passed.");
} finally {
  baseline.close();
  candidate.close();
  await rm(directory, { recursive: true, force: true });
}
