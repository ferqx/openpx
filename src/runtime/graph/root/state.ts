import { Annotation } from "@langchain/langgraph";
import type { RootMode } from "./context";
import type { 
  RecoveryFacts, 
  NarrativeState, 
  WorkingSetWindow 
} from "../../../control/context/thread-compaction-types";

export const RootState = Annotation.Root({
  input: Annotation<string>(),
  mode: Annotation<RootMode>(),
  recoveryFacts: Annotation<RecoveryFacts>(),
  narrativeState: Annotation<NarrativeState>(),
  workingSetWindow: Annotation<WorkingSetWindow>(),
  verifierPassed: Annotation<boolean>(),
  verifierFeedback: Annotation<string>(),
  resumeValue: Annotation<any>(),
  recommendationReason: Annotation<string>(),
  compactionTrigger: Annotation<"soft" | "boundary" | "hard" | undefined>(),
});
