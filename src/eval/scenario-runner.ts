import fs from "node:fs/promises";
import path from "node:path";
import { createAppContext } from "../app/bootstrap";
import { prefixedUuid } from "../shared/id-generators";
import { normalizeComparableRun } from "./comparable-run";
import { enqueueReviewItems, evaluateOutcome, evaluateTrajectory } from "./evaluation";
import {
  type EvalAppContext,
  type EvalScenario,
  type EvalScenarioResult,
  type EvalSuiteRunRecord,
} from "./eval-schema";
import { SqliteEvalStore } from "../persistence/sqlite/sqlite-eval-store";

/** 运行单个场景所需选项 */
type RunScenarioOptions = {
  scenario: EvalScenario;
  rootDir: string;
  dataDir: string;
  suiteRunId?: string;
  evalStore?: SqliteEvalStore;
};

/** 运行一组场景所需选项 */
type RunScenarioSuiteOptions = {
  suiteId: string;
  scenarios: EvalScenario[];
  rootDir: string;
  dataDir: string;
};

/** 根据 outcome/trajectory 结果推导场景总状态 */
function deriveScenarioStatus(results: Pick<EvalScenarioResult, "outcomeResults" | "trajectoryResults">): EvalScenarioResult["status"] {
  const allResults = [...results.outcomeResults, ...results.trajectoryResults];
  if (allResults.some((result) => result.status === "failed")) {
    return "failed";
  }
  if (allResults.some((result) => result.status === "suspicious")) {
    return "suspicious";
  }
  return "passed";
}

/** 在场景执行后收集 thread/run/task/approval/event/ledger，构造最终结果 */
async function collectScenarioResult(input: {
  scenario: EvalScenario;
  suiteRunId?: string;
  scenarioRunId: string;
  ctx: EvalAppContext;
  threadId: string;
  createdAt: string;
}): Promise<EvalScenarioResult> {
  const thread = await input.ctx.stores.threadStore.get(input.threadId);
  if (!thread) {
    throw new Error(`thread ${input.threadId} not found after scenario execution`);
  }

  const runs = await input.ctx.stores.runStore.listByThread(input.threadId);
  const tasks = await input.ctx.stores.taskStore.listByThread(input.threadId);
  const approvals = await input.ctx.stores.approvalStore.listByThread(input.threadId);
  const events = await input.ctx.stores.eventLog.listByThread(input.threadId);
  const ledgerEntries = await input.ctx.stores.executionLedger.listByThread(input.threadId);
  const comparable = normalizeComparableRun({
    thread,
    runs,
    tasks,
    approvals,
    events,
    ledgerEntries,
  });
  const outcomeResults = evaluateOutcome(input.scenario, comparable);
  const trajectoryResults = evaluateTrajectory(input.scenario, comparable);

  return {
    scenarioRunId: input.scenarioRunId,
    suiteRunId: input.suiteRunId,
    scenarioId: input.scenario.id,
    scenarioVersion: input.scenario.version,
    family: input.scenario.family,
    status: deriveScenarioStatus({ outcomeResults, trajectoryResults }),
    threadId: thread.threadId,
    primaryRunId: runs.at(-1)?.runId,
    primaryTaskId: tasks.at(-1)?.taskId,
    comparable,
    outcomeResults,
    trajectoryResults,
    createdAt: input.createdAt,
    completedAt: new Date().toISOString(),
  };
}

export async function runScenario(input: RunScenarioOptions): Promise<EvalScenarioResult> {
  await fs.mkdir(input.rootDir, { recursive: true });
  const workspaceRoot = path.join(input.rootDir, "workspace");
  const runtimeDataDir = path.join(input.rootDir, "runtime.db");
  await fs.mkdir(workspaceRoot, { recursive: true });

  const store = input.evalStore ?? new SqliteEvalStore(input.dataDir);
  const createdAt = new Date().toISOString();
  const scenarioRunId = prefixedUuid("scenario_run");
  let ctx = await createAppContext({
    workspaceRoot,
    dataDir: runtimeDataDir,
    modelGateway: input.scenario.createModelGateway(workspaceRoot),
  });
  let activeContext: EvalAppContext = ctx;

  try {
    const execution = await input.scenario.run({
      ctx,
      workspaceRoot,
      dataDir: runtimeDataDir,
    });
    activeContext = execution.postRunContext ?? ctx;

    const result = await collectScenarioResult({
      scenario: input.scenario,
      suiteRunId: input.suiteRunId,
      scenarioRunId,
      ctx: activeContext,
      threadId: execution.threadId,
      createdAt,
    });
    await store.saveScenarioResult(result);

    const reviewItems = enqueueReviewItems({
      scenarioId: input.scenario.id,
      scenarioRunId,
      outcomeResults: result.outcomeResults,
      trajectoryResults: result.trajectoryResults,
      comparable: result.comparable,
    });
    for (const reviewItem of reviewItems) {
      await store.saveReviewItem(reviewItem);
    }

    return result;
  } finally {
    if (activeContext !== ctx) {
      await activeContext.close();
    }
    await ctx.close();
    if (!input.evalStore) {
      await store.close();
    }
  }
}

export async function runScenarioSuite(input: RunScenarioSuiteOptions): Promise<{
  suiteRunId: string;
  results: EvalScenarioResult[];
}> {
  const store = new SqliteEvalStore(input.dataDir);
  const suiteRun: EvalSuiteRunRecord = {
    suiteRunId: prefixedUuid("suite_run"),
    suiteId: input.suiteId,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await store.saveSuiteRun(suiteRun);

  const results: EvalScenarioResult[] = [];

  try {
    for (const scenario of input.scenarios) {
      const scenarioRoot = path.join(input.rootDir, scenario.id);
      const result = await runScenario({
        scenario,
        rootDir: scenarioRoot,
        dataDir: input.dataDir,
        suiteRunId: suiteRun.suiteRunId,
        evalStore: store,
      });
      results.push(result);
    }

    await store.saveSuiteRun({
      ...suiteRun,
      status: results.some((result) => result.status === "failed") ? "failed" : "completed",
      completedAt: new Date().toISOString(),
    });
    return { suiteRunId: suiteRun.suiteRunId, results };
  } catch (error) {
    await store.saveSuiteRun({
      ...suiteRun,
      status: "failed",
      completedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    await store.close();
  }
}
