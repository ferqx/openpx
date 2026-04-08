import { END, START, StateGraph } from "@langchain/langgraph";
import type { RootGraphContext } from "./context";
import { RootState } from "./state";
import { routeNode } from "./nodes/route";
import { postTurnGuardNode } from "./nodes/post-turn-guard";
import { intakeNormalizeNode } from "./nodes/intake-normalize";
import { createPlannerWorkerGraph } from "../../workers/planner/graph";
import { createExecutorWorkerGraph } from "../../workers/executor/graph";
import { createVerifierWorkerGraph } from "../../workers/verifier/graph";
import type { ResumeControl } from "./resume-control";

export async function createRootGraph(context: RootGraphContext) {
  const plannerGraph = await createPlannerWorkerGraph(context.planner);
  const executorGraph = await createExecutorWorkerGraph(context.executor);
  const verifierGraph = await createVerifierWorkerGraph(context.verifier);

  const graph = new StateGraph(RootState)
    .addNode("intake", async (state, config) => {
      const threadId = config.configurable?.thread_id as string | undefined;
      const view = threadId && context.getThreadView ? await context.getThreadView(threadId) : undefined;
      
      let input = state.input;
      if (typeof state.resumeValue === "string") {
        const resumeText = state.resumeValue.toLowerCase();
        const isConfirmation = /\b(yes|ok|approve|confirm|start|proceed)\b/.test(resumeText);
        if (!isConfirmation) {
          input = state.resumeValue;
        }
      } else if (state.resumeValue) {
        const resumeControl = state.resumeValue as ResumeControl;
        if (resumeControl.kind === "approval_resolution" && resumeControl.decision === "rejected" && resumeControl.reason) {
          input = resumeControl.reason;
        }
      }

      const normalizedInput = intakeNormalizeNode({ input: input.trim() }).normalizedInput;

      return {
        input: normalizedInput.goal,
        resumeValue: undefined, // Clear after use
        ...(view ? {
          recoveryFacts: view.recoveryFacts,
          narrativeState: view.narrativeState,
          workingSetWindow: view.workingSetWindow,
        } : {})
      };
    })
    .addNode("router", routeNode)
    .addNode("planner", async (state, config) => {
      return plannerGraph.invoke({ input: state.input }, config);
    })
    .addNode("responder", async (state, config) => {
      if (!context.responder) {
        return { summary: state.input, mode: "done" };
      }
      const result = await context.responder({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        configurable: config.configurable,
      });
      return {
        summary: result.summary,
        mode: "done" as const,
      };
    })
    .addNode("executor", (state, config) => {
      return context.executor({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        configurable: config.configurable,
      });
    })
    .addNode("verifier", async (state, config) => {
      const result = await verifierGraph.invoke({ input: state.input }, config);
      return {
        summary: result.summary,
        verifierPassed: result.isValid,
        verifierFeedback: result.feedback,
      };
    })
    .addNode("post-turn-guard", postTurnGuardNode)
    .addNode("compact", (state, config) => {
      if (context.compactionPolicy && state.compactionTrigger) {
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
    .addEdge("intake", "router")
    .addConditionalEdges("router", (state) => {
      switch (state.mode) {
        case "plan":
          return "planner";
        case "respond":
          return "responder";
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
    .addEdge("responder", END)
    .addConditionalEdges("verifier", (state) => {
      if (state.verifierPassed === false) {
        return "router";
      }
      return END;
    })
    .addEdge("executor", "post-turn-guard")
    .addConditionalEdges("post-turn-guard", (state) => {
      if (state.compactionTrigger) return "compact";
      if (state.mode === "done") return END;
      return END; 
    })
    .addEdge("compact", END);

  return graph.compile({
    checkpointer: context.checkpointer,
  });
}
