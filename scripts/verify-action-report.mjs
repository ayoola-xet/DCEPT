import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const directory = await mkdtemp(join(tmpdir(), "glamprobe-action-"));
const reportPath = join(directory, "report.json");

try {
  await writeFile(reportPath, JSON.stringify({
    actions: [{
      id: "capabilities",
      diffs: [{ path: "/result", baseline: "a", candidate: "b" }],
      assertion_failures: [{ target: "candidate", rule: "contains_all", path: "/result" }],
    }],
    cases: [{ index: 4, report: { actions: [{
      id: "fuzzed",
      diffs: [],
      assertion_failures: [{ target: "baseline", rule: "equals", path: "/result" }],
    }] } }],
  }));
  const output = await command("node", ["actions/glamprobe/report.mjs", reportPath]);
  if (output.code !== 0) throw new Error(output.stderr);
  if (!output.stdout.includes("GlamProbe difference (capabilities)") || !output.stdout.includes("GlamProbe assertion (capabilities)") || !output.stdout.includes("case 4:") || !output.stdout.includes("3 findings")) {
    throw new Error(`Action report did not emit all finding annotations. ${output.stdout}`);
  }
  console.log("GitHub Action report invariant passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}

function command(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}
