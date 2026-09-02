import { readFile } from "node:fs/promises";

const [reportPath] = process.argv.slice(2);
const report = JSON.parse(await readFile(reportPath, "utf8"));
let count = 0;
for (const action of report.actions ?? []) {
  for (const difference of action.diffs ?? []) {
    count += 1;
    const baseline = JSON.stringify(difference.baseline);
    const candidate = JSON.stringify(difference.candidate);
    console.log(`::warning title=GlamProbe finding (${action.id})::${difference.path || "/"}: baseline=${baseline}; candidate=${candidate}`);
  }
}
console.log(`GlamProbe found ${count} difference${count === 1 ? "" : "s"}.`);
