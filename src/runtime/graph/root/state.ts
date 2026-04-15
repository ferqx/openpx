import { Annotation } from "@langchain/langgraph";
import type {
  FinalResponseSource,
  InteractionIntent,
  PendingApprovalState,
  RootMode,
  RootRoute,
  VerificationReport,
} from "./context";
import type { ResumeControl } from "./resume-control";
import type { ArtifactRecord } from "../../artifacts/artifact-index";
import type { PlannerResult } from "../../planning/planner-result";
import type { 
  RecoveryFacts, 
  NarrativeState, 
  WorkingSetWindow 
} from "../../../control/context/thread-compaction-types";
import type { WorkPackage } from "../../planning/work-package";

/** RootState 是 LangGraph 根图的单一事实源。
 * 这里把 planner/work-package、approval、artifact、verification、
 * 以及 thread 压缩视图恢复出的 recovery/narrative/working-set 放在同一个状态对象里。 */
export const RootState = Annotation.Root({
  input: Annotation<string>(),
  plannerSummary: Annotation<string | undefined>(),
  executionSummary: Annotation<string | undefined>(),
  verificationSummary: Annotation<string | undefined>(),
  pauseSummary: Annotation<string | undefined>(),
  finalResponse: Annotation<string | undefined>(),
  finalResponseSource: Annotation<FinalResponseSource | undefined>(),
  interactionIntent: Annotation<InteractionIntent>({
    reducer: (_, next) => next,
    default: () => "user_request",
  }),
  mode: Annotation<RootMode>(),
  route: Annotation<RootRoute>({
    // route 每轮都以最新决策覆盖，不累积历史值。
    reducer: (_, next) => next,
    default: () => "unrouted",
  }),
  plannerResult: Annotation<PlannerResult | undefined>(),
  workPackages: Annotation<WorkPackage[]>({
    // workPackages 由 planner 或 phase-commit 整体重写，不做增量合并。
    reducer: (_, next) => next,
    default: () => [],
  }),
  currentWorkPackageId: Annotation<string | undefined>(),
  pendingApproval: Annotation<PendingApprovalState | undefined>(),
  approved: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  artifacts: Annotation<ArtifactRecord[]>({
    // artifacts 是 durable 集合；节点更新时直接交出下一份完整列表。
    reducer: (_, next) => next,
    default: () => [],
  }),
  verificationReport: Annotation<VerificationReport | undefined>(),
  latestArtifacts: Annotation<ArtifactRecord[]>({
    // latestArtifacts 只保存当前回合新产出的 artifact，phase-commit 后会清空。
    reducer: (_, next) => next,
    default: () => [],
  }),
  approvedApprovalRequestId: Annotation<string | undefined>(),
  lastCompletedToolCallId: Annotation<string | undefined>(),
  lastCompletedToolName: Annotation<string | undefined>(),
  pendingToolCallId: Annotation<string | undefined>(),
  pendingToolName: Annotation<string | undefined>(),
  executionDetails: Annotation<unknown>(),
  recoveryFacts: Annotation<RecoveryFacts>(),
  narrativeState: Annotation<NarrativeState>(),
  workingSetWindow: Annotation<WorkingSetWindow>(),
  verifierPassed: Annotation<boolean>(),
  verifierFeedback: Annotation<string>(),
  resumeValue: Annotation<string | ResumeControl | undefined>(),
  recommendationReason: Annotation<string>(),
  compactionTrigger: Annotation<"soft" | "boundary" | "hard" | undefined>(),
});
