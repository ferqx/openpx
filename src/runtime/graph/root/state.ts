import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { RootMode } from "./context";

export const RootState = Annotation.Root({
  input: Annotation<string>(),
  mode: Annotation<RootMode>(),
  summary: Annotation<string>(),
  messages: MessagesAnnotation.spec.messages,
});
