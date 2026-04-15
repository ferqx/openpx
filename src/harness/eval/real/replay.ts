import fs from "node:fs/promises";
import path from "node:path";
import { evaluateOutcome, evaluateTrajectory } from "../../../eval/evaluation";
import {
  type EvalCheckResult,
  type EvalRuleResult,
} from "../../../eval/eval-schema";
import { findRealEvalScenario, findRealEvalOfflineScenario } from "./scenarios";
import { realRunTraceSchema, realSampleSummarySchema, type RealRunTrace, type RealSampleSummary, type RealEvalScenario } from "./real-eval-schema";

/**
 * harness real-eval replay 工具。
 * 它用于基于 durable trace 与 runtime facts 做复盘和一致性验证。
 */
/** 已落盘的 real sample：摘要 + trace */
export type StoredRealSample = {
  summary: RealSampleSummary;
  trace: RealRunTrace;
};

/** 离线回放后的 real sample 评估结果 */
export type OfflineRealSampleEvaluation = StoredRealSample & {
  scenario: Readonly<RealEvalScenario>;
  outcomeResults: EvalCheckResult[];
  trajectoryResults: EvalRuleResult[];
};

/** 从 artifacts 目录加载已落盘的 real sample */
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

/** 重放一条 trace，按离线场景重新计算 outcome/trajectory */
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

/** 加载并重放一个已落盘 sample */
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

/** 提取 trace 的快速检查信息 */
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
