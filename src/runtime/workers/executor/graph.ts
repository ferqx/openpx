import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { WorkerHandler } from "../../graph/root/context";

/** executor worker 的局部状态 */
const ExecutorWorkerState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string>(),
  mode: Annotation<"execute">(),
});

/** 创建 executor worker graph：单节点包装真实 handler */
export async function createExecutorWorkerGraph(handler: WorkerHandler<"execute">) {
  return new StateGraph(ExecutorWorkerState)
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
