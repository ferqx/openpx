import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { WorkerHandler } from "../../graph/root/context";

/** memory maintainer worker 的局部状态 */
const MemoryMaintainerWorkerState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string>(),
  mode: Annotation<"execute">(),
});

/** 创建 memory maintainer worker graph：当前是单节点包装 */
export async function createMemoryMaintainerWorkerGraph(handler: WorkerHandler<"execute">) {
  return new StateGraph(MemoryMaintainerWorkerState)
    .addNode("run", async (state, config) =>
      handler({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        configurable: config.configurable,
      }),
    )
    .addEdge(START, "run")
    .addEdge("run", END)
    .compile();
}
