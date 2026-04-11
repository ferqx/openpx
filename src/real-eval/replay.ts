import fs from "node:fs/promises";
import path from "node:path";
import { evaluateOutcome, evaluateTrajectory } from "../eval/evaluation";
import {
  type EvalCheckResult,
  type EvalRuleResult,
} from "../eval/eval-schema";
import { findRealEvalScenario, findRealEvalOfflineScenario } from "./scenarios";
import { realRunTraceSchema, realSampleSummarySchema, type RealRunTrace, type RealSampleSummary, type RealEvalScenario } from "./real-eval-schema";

export type StoredRealSample = {
  summary: RealSampleSummary;
  trace: RealRunTrace;
};

export type OfflineRealSampleEvaluation = StoredRealSample & {
  scenario: Readonly<RealEvalScenario>;
  outcomeResults: EvalCheckResult[];
  trajectoryResults: EvalRuleResult[];
};

export async function loadStoredRealSample(artifactsDir: string): Promise<StoredRealSample> {
  const summaryPath = path.join(artifactsDir, "result.json");
  const localTracePath = path.join(artifactsDir, "trace.json");
  const storedSummary = realSampleSummarySchema.parse(JSON.parse(await fs.readFile(summaryPath, "utf8")));
  const summary = realSampleSummarySchema.parse({
    ...storedSummary,
    artifactsDir,
    tracePath: localTracePath,
  });
  const trace = realRunTraceSchema.parse(JSON.parse(await fs.readFile(localTracePath, "utf8")));
  return { summary, trace };
}

export function replayRealSampleEvaluation(trace: RealRunTrace): {
  scenario: Readonly<RealEvalScenario>;
  outcomeResults: EvalCheckResult[];
  trajectoryResults: EvalRuleResult[];
} {
  const scenario = findRealEvalScenario(trace.scenarioId);
  const offlineScenario = findRealEvalOfflineScenario(trace.scenarioId);
  if (!scenario || !offlineScenario) {
    throw new Error(`No canonical real-eval scenario found for ${trace.scenarioId}.`);
  }
  return {
    scenario,
    outcomeResults: evaluateOutcome(offlineScenario, trace.comparable),
    trajectoryResults: evaluateTrajectory(offlineScenario, trace.comparable),
  };
}

export async function replayStoredRealSampleEvaluation(artifactsDir: string): Promise<OfflineRealSampleEvaluation> {
  const stored = await loadStoredRealSample(artifactsDir);
  const replayed = replayRealSampleEvaluation(stored.trace);
  return {
    ...stored,
    scenario: replayed.scenario,
    outcomeResults: replayed.outcomeResults,
    trajectoryResults: replayed.trajectoryResults,
  };
}

export function inspectRealSampleTrace(trace: RealRunTrace): {
  scenarioId: RealRunTrace["scenarioId"];
  promptVariantId: string;
  threadId: string;
  runId: string;
  taskId: string;
  milestoneKinds: RealRunTrace["milestones"][number]["kind"][];
  pendingApprovalCount: number;
  unknownAfterCrashCount: number;
} {
  return {
    scenarioId: trace.scenarioId,
    promptVariantId: trace.promptVariantId,
    threadId: trace.threadId,
    runId: trace.runId,
    taskId: trace.taskId,
    milestoneKinds: trace.milestones.map((milestone) => milestone.kind),
    pendingApprovalCount: trace.pendingApprovalCount,
    unknownAfterCrashCount: trace.unknownAfterCrashCount,
  };
}
