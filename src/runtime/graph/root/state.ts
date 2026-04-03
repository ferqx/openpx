import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { RootMode } from "./context";
import type { ThreadNarrative } from "../../../control/context/thread-narrative-service";
import type { TaskWorkingState } from "../../../control/context/task-working-state";

export const RootState = Annotation.Root({
  input: Annotation<string>(),
  mode: Annotation<RootMode>(),
  summary: Annotation<string>(),
  messages: MessagesAnnotation.spec.messages,
  narrative: Annotation<ThreadNarrative>(),
  taskWorkingState: Annotation<TaskWorkingState>(),
  verifierPassed: Annotation<boolean>(),
  verifierFeedback: Annotation<string>(),
  resumeValue: Annotation<any>(),
  recommendationReason: Annotation<string>(),
});
