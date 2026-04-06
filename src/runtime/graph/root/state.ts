import { Annotation } from "@langchain/langgraph";
import type { RootMode } from "./context";
import type { ResumeControl } from "./resume-control";
import type { 
  RecoveryFacts, 
  NarrativeState, 
  WorkingSetWindow 
} from "../../../control/context/thread-compaction-types";

export const RootState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string | undefined>(),
  mode: Annotation<RootMode>(),
  recoveryFacts: Annotation<RecoveryFacts>(),
  narrativeState: Annotation<NarrativeState>(),
  workingSetWindow: Annotation<WorkingSetWindow>(),
  verifierPassed: Annotation<boolean>(),
  verifierFeedback: Annotation<string>(),
  resumeValue: Annotation<string | ResumeControl | undefined>(),
  recommendationReason: Annotation<string>(),
  compactionTrigger: Annotation<"soft" | "boundary" | "hard" | undefined>(),
});
