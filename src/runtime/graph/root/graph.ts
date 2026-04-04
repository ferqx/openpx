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
    .addNode("intake", async (state, config) => {
      const threadId = config.configurable?.thread_id as string | undefined;
      const view = threadId && context.getThreadView ? await context.getThreadView(threadId) : undefined;
      
      let input = state.input;
      if (state.resumeValue && typeof state.resumeValue === "string") {
        const resumeText = state.resumeValue.toLowerCase();
        const isConfirmation = /\b(yes|ok|approve|confirm|start|proceed)\b/.test(resumeText);
        if (!isConfirmation) {
          input = state.resumeValue;
        }
      }

      return {
        input: input.trim(),
        resumeValue: undefined, // Clear after use
        ...(view ? {
          recoveryFacts: view.recoveryFacts,
          narrativeState: view.narrativeState,
          workingSetWindow: view.workingSetWindow,
        } : {})
      };
    })
    .addNode("route", routeNode)
    .addNode("planner", async (state, config) => {
      console.log("[DEBUG] node: planner");
      return plannerGraph.invoke({ input: state.input }, config);
    })
    .addNode("executor", (state, config) => {
      console.log("[DEBUG] node: executor");
      return context.executor({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        configurable: config.configurable,
      });
    })
    .addNode("verifier", async (state, config) => {
      console.log("[DEBUG] node: verifier");
      const result = await verifierGraph.invoke({ input: state.input }, config);
      return {
        // summary is gone, so map it? 
        // wait, I need to see what I should do with summary. 
        verifierPassed: result.isValid,
        verifierFeedback: result.feedback,
      };
    })
    .addNode("post-turn-guard", postTurnGuardNode)
    .addNode("compact", (state, config) => {
      console.log("[DEBUG] node: compact");
      if (context.compactionPolicy && state.compactionTrigger) {
        // Wait, compactionPolicy.compact takes DerivedThreadView.
        const view = {
          recoveryFacts: state.recoveryFacts,
          narrativeState: state.narrativeState,
          workingSetWindow: state.workingSetWindow,
        };
        const nextView = context.compactionPolicy.compact(view, {
          trigger: state.compactionTrigger,
        });
        return {
          recoveryFacts: nextView.recoveryFacts,
          narrativeState: nextView.narrativeState,
          workingSetWindow: nextView.workingSetWindow,
          compactionTrigger: undefined,
        };
      }
      return {};
    })
    .addEdge(START, "intake")
    .addEdge("intake", "route")
    .addConditionalEdges("route", (state) => {
      switch (state.mode) {
        case "plan":
          return "planner";
        case "verify":
          return "verifier";
        case "waiting_approval":
          return "post-turn-guard";
        case "done":
          return END;
        default:
          return "executor";
      }
    })
    .addEdge("planner", END)
    .addConditionalEdges("verifier", (state) => {
      if (state.verifierPassed === false) {
        return "route";
      }
      return END;
    })
    .addEdge("executor", "post-turn-guard")
    .addConditionalEdges("post-turn-guard", (state) => {
      if (state.compactionTrigger) return "compact";
      if (state.mode === "done") return END;
      return "intake";
    })
    .addEdge("compact", "intake");

  return graph.compile({
    checkpointer: context.checkpointer,
  });
}
