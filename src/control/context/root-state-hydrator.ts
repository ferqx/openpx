import type { DerivedThreadView, RecoveryFacts, NarrativeState, WorkingSetWindow } from "./thread-compaction-types";
import { EnvironmentService } from "./environment-service";

export type HydrationOptions = {
  workspaceRoot: string;
  currentCwd: string;
};

/**
 * Hydrates the LangGraph root state from a compacted thread view.
 */
export function hydrateRootState(view: DerivedThreadView, options: HydrationOptions) {
  const recoveryFacts = view.recoveryFacts;
  if (!recoveryFacts) {
    throw new Error("Cannot hydrate root state without recovery facts");
  }

  const narrativeState = view.narrativeState ?? createEmptyNarrative();
  const workingSet = view.workingSetWindow ?? createEmptyWorkingSet();
  const envService = new EnvironmentService(options.workspaceRoot);

  const contextualMessages = [
    `SYSTEM: Thread context restored (Revision: ${recoveryFacts.revision}).`,
    `Current Goal: ${recoveryFacts.activeTask?.summary ?? "Awaiting next task."}`,
    `Previous Progress: ${narrativeState.threadSummary}`,
  ];

  // 1. Environmental Consistency Check
  if (recoveryFacts.environment) {
    const alignment = envService.verifyAlignment(recoveryFacts.environment, options.currentCwd);
    if (!alignment.aligned) {
      contextualMessages.push(
        `WARNING: Environmental Drift Detected! ${alignment.reason}. The agent should verify the current project state before proceeding.`
      );
    }
  }

  if (recoveryFacts.ledgerState?.pendingToolCallId) {
    contextualMessages.push(
      `CRITICAL: Recovery from potential crash. Tool call ${recoveryFacts.ledgerState.pendingToolCallId} was pending. VERIFY the effect on disk before re-running.`
    );
  }

  if (recoveryFacts.blocking) {
    contextualMessages.push(
      `STATUS: BLOCKED. Reason: ${recoveryFacts.blocking.kind} - ${recoveryFacts.blocking.message}`
    );
  }

  if (recoveryFacts.pendingApprovals.length > 0) {
    contextualMessages.push(
      `PENDING APPROVALS: ${recoveryFacts.pendingApprovals.map(a => a.summary).join(", ")}`
    );
  }

  return {
    recoveryFacts: { ...recoveryFacts },
    narrativeState: { ...narrativeState },
    messages: [
      ...contextualMessages,
      ...(workingSet.messages ?? [])
    ],
    revision: recoveryFacts.revision,
    lastEventSeq: recoveryFacts.resumeAnchor?.lastEventSeq ?? 0,
    mode: deriveInitialMode(recoveryFacts),
    status: recoveryFacts.status,
  };
}

function createEmptyNarrative(): NarrativeState {
  return {
    revision: 0,
    threadSummary: "",
    taskSummaries: [],
    openLoops: [],
    notableEvents: [],
    updatedAt: new Date().toISOString()
  };
}

function createEmptyWorkingSet(): WorkingSetWindow {
  return {
    revision: 0,
    messages: [],
    toolResults: [],
    verifierFeedback: [],
    retrievedMemories: [],
    updatedAt: new Date().toISOString()
  };
}

function deriveInitialMode(facts: RecoveryFacts): "plan" | "execute" | "verify" | "done" | "waiting_approval" {
  if (facts.blocking?.kind === "waiting_approval") return "waiting_approval";
  if (facts.activeTask?.status === "blocked") return "plan"; // Re-plan if blocked for non-approval reason
  if (facts.activeTask?.status === "running") return "execute";
  return "plan";
}
