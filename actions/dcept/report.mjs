import { readFile } from "node:fs/promises";

const [reportPath] = process.argv.slice(2);
const report = JSON.parse(await readFile(reportPath, "utf8"));
let count = 0;
for (const { action, caseIndex } of actionsIn(report)) {
  const prefix = caseIndex === undefined ? "" : `case ${caseIndex}: `;
  for (const difference of action.diffs ?? []) {
    count += 1;
    const baseline = JSON.stringify(difference.baseline);
    const candidate = JSON.stringify(difference.candidate);
    console.log(`::warning title=DCEPT difference (${action.id})::${prefix}${difference.path || "/"}: baseline=${baseline}; candidate=${candidate}`);
  }
  for (const failure of action.assertion_failures ?? []) {
    count += 1;
    console.log(`::warning title=DCEPT assertion (${action.id})::${prefix}${failure.target} does not satisfy ${failure.rule} at ${failure.path || "/"}.`);
  }
}
console.log(`DCEPT found ${count} finding${count === 1 ? "" : "s"}.`);

function* actionsIn(value) {
  for (const action of value.actions ?? []) yield { action };
  for (const fuzzCase of value.cases ?? []) {
    for (const action of fuzzCase.report?.actions ?? []) yield { action, caseIndex: fuzzCase.index };
  }
}
