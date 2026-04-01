import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { WorkerHandler } from "../../graph/root/context";

const VerifierWorkerState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string>(),
  mode: Annotation<"verify">(),
});

export async function createVerifierWorkerGraph(handler: WorkerHandler<"verify">) {
  return new StateGraph(VerifierWorkerState)
    .addNode("run", async (state) => handler({ input: state.input }))
    .addEdge(START, "run")
    .addEdge("run", END)
    .compile();
}
