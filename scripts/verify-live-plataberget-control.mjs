import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";

const endpoint = "https://rpc.plataberget.ethpandaops.io";
const binary = join(process.cwd(), "target", "debug", process.platform === "win32" ? "dcept.exe" : "dcept");
const result = await command(binary, [
  "probe", "run", "glamsterdam/fork-boundary-control",
  "--baseline", endpoint,
  "--candidate", endpoint,
]);
assert.equal(result.code, 2, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.comparison_mode, "control");
assert.equal(report.status, "findings");
assert.equal(report.definitive_compatibility_claim, false);
assert.notDeepEqual(report.prepared_requests[0].baseline, report.prepared_requests[0].candidate);
assert.equal(report.actions[0].assertion_failures.length, 0);
assert.ok(report.actions[0].diffs.length > 0);
assert.match(report.warnings.join(" "), /not a controlled upgrade-differential result/);
console.log("Live Plataberget control invariant passed.");

function command(commandName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}
