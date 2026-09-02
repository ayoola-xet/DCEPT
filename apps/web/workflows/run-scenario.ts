import { completeRun, executeBatch, failRun, prepareRun } from "@/lib/run-execution";

export async function runScenarioWorkflow(runId: string) {
  "use workflow";
  try {
    const prepared = await prepareRun(runId);
    if (prepared.canceled) return { status: "canceled" };
    let index = 0;
    while (index < prepared.actionCount) {
      const batch = await executeBatch(runId, index);
      if (batch.canceled) return { status: "canceled" };
      index = batch.nextIndex;
    }
    await completeRun(runId);
    return { status: "completed" };
  } catch (error) {
    await failRun(runId, error instanceof Error ? error.message : "Run failed.");
    throw error;
  }
}
