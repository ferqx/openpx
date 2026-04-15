import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { WorkerHandler } from "../../graph/root/context";
import type { PlannerResult } from "../../planning/planner-result";
import type { WorkPackage } from "../../planning/work-package";

/** planner worker 的局部状态 */
const PlannerWorkerState = Annotation.Root({
  input: Annotation<string>(),
  summary: Annotation<string>(),
  mode: Annotation<"plan">(),
  plannerResult: Annotation<PlannerResult | undefined>(),
  workPackages: Annotation<WorkPackage[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});

/** 创建 planner worker graph：单节点执行 handler，并回传 plannerResult/workPackages */
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
