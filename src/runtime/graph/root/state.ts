import { Annotation } from "@langchain/langgraph";
import type {
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

export const RootState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string | undefined>(),
  mode: Annotation<RootMode>(),
  route: Annotation<RootRoute>({
    reducer: (_, next) => next,
    default: () => "unrouted",
  }),
  plannerResult: Annotation<PlannerResult | undefined>(),
  workPackages: Annotation<WorkPackage[]>({
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
    reducer: (_, next) => next,
    default: () => [],
  }),
  verificationReport: Annotation<VerificationReport | undefined>(),
  finalAnswer: Annotation<string | undefined>(),
  latestArtifacts: Annotation<ArtifactRecord[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
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
