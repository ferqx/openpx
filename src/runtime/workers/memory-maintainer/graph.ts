import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { WorkerHandler } from "../../graph/root/context";

const MemoryMaintainerWorkerState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string>(),
  mode: Annotation<"execute">(),
});

export async function createMemoryMaintainerWorkerGraph(handler: WorkerHandler<"execute">) {
  return new StateGraph(MemoryMaintainerWorkerState)
    .addNode("run", async (state) => handler({ input: state.input }))
    .addEdge(START, "run")
    .addEdge("run", END)
    .compile();
}
