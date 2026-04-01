import { END, START, StateGraph } from "@langchain/langgraph";
import type { RootGraphContext } from "./context";
import { RootState } from "./state";
import { intakeNode } from "./nodes/intake";
import { routeNode } from "./nodes/route";
import { postTurnGuardNode } from "./nodes/post-turn-guard";
import { createPlannerWorkerGraph } from "../../workers/planner/graph";
import { createExecutorWorkerGraph } from "../../workers/executor/graph";
import { createVerifierWorkerGraph } from "../../workers/verifier/graph";

export async function createRootGraph(context: RootGraphContext) {
  const plannerGraph = await createPlannerWorkerGraph(context.planner);
  const executorGraph = await createExecutorWorkerGraph(context.executor);
  const verifierGraph = await createVerifierWorkerGraph(context.verifier);

  const graph = new StateGraph(RootState)
    .addNode("intake", intakeNode)
    .addNode("route", routeNode)
    .addNode("planner", async (state, config) =>
      plannerGraph.invoke({ input: state.input }, config),
    )
    .addNode("executor", async (state, config) =>
      executorGraph.invoke({ input: state.input }, config),
    )
    .addNode("verifier", async (state, config) =>
      verifierGraph.invoke({ input: state.input }, config),
    )
    .addNode("post-turn-guard", postTurnGuardNode)
    .addEdge(START, "intake")
    .addEdge("intake", "route")
    .addConditionalEdges("route", (state) => {
      switch (state.mode) {
        case "plan":
          return "planner";
        case "verify":
          return "verifier";
        default:
          return "executor";
      }
    })
    .addEdge("planner", END)
    .addEdge("verifier", END)
    .addEdge("executor", "post-turn-guard")
    .addEdge("post-turn-guard", END);

  return graph.compile({
    checkpointer: context.checkpointer,
  });
}
