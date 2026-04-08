import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { WorkerHandler } from "../../graph/root/context";
import type { WorkPackage } from "../../planning/work-package";

const PlannerWorkerState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string>(),
  mode: Annotation<"plan">(),
  workPackages: Annotation<WorkPackage[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});

export async function createPlannerWorkerGraph(handler: WorkerHandler<"plan">) {
  return new StateGraph(PlannerWorkerState)
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
