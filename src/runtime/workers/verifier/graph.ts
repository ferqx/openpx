import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { WorkerHandler } from "../../graph/root/context";
import type { ArtifactRecord } from "../../artifacts/artifact-index";
import type { PlannerResult } from "../../planning/planner-result";
import type { WorkPackage } from "../../planning/work-package";

/** verifier worker 的局部状态 */
const VerifierWorkerState = Annotation.Root({
  input: Annotation<string>(),
  verificationSummary: Annotation<string>(),
  mode: Annotation<"verify">(),
  isValid: Annotation<boolean>(),
  feedback: Annotation<string>(),
  currentWorkPackage: Annotation<WorkPackage | undefined>(),
  artifacts: Annotation<ArtifactRecord[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  plannerResult: Annotation<PlannerResult | undefined>(),
});

/** 创建 verifier worker graph：单节点执行 handler，并回传验证结果 */
export async function createVerifierWorkerGraph(handler: WorkerHandler<"verify">) {
  return new StateGraph(VerifierWorkerState)
    .addNode("run", async (state, config) =>
      handler({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        currentWorkPackage: state.currentWorkPackage,
        artifacts: state.artifacts,
        plannerResult: state.plannerResult,
        configurable: config.configurable,
      }),
    )
    .addEdge(START, "run")
    .addEdge("run", END)
    .compile();
}
