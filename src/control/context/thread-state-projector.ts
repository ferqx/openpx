import type { ApprovalRequest } from "../../domain/approval";
import type { DerivedThreadView, NarrativeState, RecoveryFacts, WorkingSetWindow } from "./thread-compaction-types";
import {
  createThreadCompactionClassifier,
  type ThreadCompactionClassifier,
} from "./thread-compaction-classifier";
import type { ControlTask } from "../tasks/task-types";

export type ThreadProjectionInput =
  | { kind: "task"; task: ControlTask }
  | { kind: "approval"; approval: ApprovalRequest }
  | { kind: "answer"; answerId: string; summary: string }
  | { kind: "event"; eventType: string; summary: string; sourceTaskId?: string }
  | { kind: "tool_result"; content: string }
  | { kind: "verifier_feedback"; content: string }
  | { kind: "message"; content: string }
  | { kind: "retrieved_memory"; content: string };

export interface ThreadStateProjector {
  project(view: DerivedThreadView, input: ThreadProjectionInput): DerivedThreadView;
}

export type ThreadStateProjectorOptions = {
  classifier?: ThreadCompactionClassifier;
};

function cloneRecoveryFacts(input?: RecoveryFacts): RecoveryFacts {
  return {
    activeTask: input?.activeTask ? { ...input.activeTask } : undefined,
    lastStableTask: input?.lastStableTask ? { ...input.lastStableTask } : undefined,
    blocking: input?.blocking ? { ...input.blocking } : undefined,
    pendingApprovals: [...(input?.pendingApprovals ?? [])],
    latestDurableAnswer: input?.latestDurableAnswer ? { ...input.latestDurableAnswer } : undefined,
    resumeAnchor: input?.resumeAnchor ? { ...input.resumeAnchor } : undefined,
  };
}

function cloneNarrativeState(input?: NarrativeState): NarrativeState {
  return {
    threadSummary: input?.threadSummary ?? "",
    taskSummaries: [...(input?.taskSummaries ?? [])],
    openLoops: [...(input?.openLoops ?? [])],
    notableEvents: [...(input?.notableEvents ?? [])],
  };
}

function cloneWorkingSetWindow(input?: WorkingSetWindow): WorkingSetWindow {
  return {
    messages: [...(input?.messages ?? [])],
    toolResults: [...(input?.toolResults ?? [])],
    verifierFeedback: [...(input?.verifierFeedback ?? [])],
    retrievedMemories: [...(input?.retrievedMemories ?? [])],
  };
}

function composeThreadSummary(narrativeState: NarrativeState): string {
  return narrativeState.taskSummaries.join("; ");
}

function isNonterminalTask(status: ControlTask["status"]): boolean {
  return status === "queued" || status === "running" || status === "blocked";
}

function shouldClearTaskRecoveryState(
  currentView: DerivedThreadView,
  task: ControlTask,
): boolean {
  return (
    currentView.recoveryFacts?.activeTask?.taskId === task.taskId
    || currentView.recoveryFacts?.blocking?.sourceTaskId === task.taskId
  );
}

function deriveBlockingFromPendingApprovals(recoveryFacts: RecoveryFacts): RecoveryFacts["blocking"] {
  const nextPendingApproval = recoveryFacts.pendingApprovals[0];
  if (!nextPendingApproval) {
    return undefined;
  }

  return {
    sourceTaskId: nextPendingApproval.taskId,
    kind: "waiting_approval",
    message: nextPendingApproval.summary,
  };
}

export function createThreadStateProjector(
  options: ThreadStateProjectorOptions = {},
): ThreadStateProjector {
  const classifier = options.classifier ?? createThreadCompactionClassifier();

  return {
    project(view, input) {
      const nextView: DerivedThreadView = {
        recoveryFacts: cloneRecoveryFacts(view.recoveryFacts),
        narrativeState: cloneNarrativeState(view.narrativeState),
        workingSetWindow: cloneWorkingSetWindow(view.workingSetWindow),
      };

      switch (input.kind) {
        case "task": {
          const roles = classifier.classifyTask(input.task);

          if (roles.includes("RecoveryFact")) {
            if (isNonterminalTask(input.task.status)) {
              nextView.recoveryFacts!.activeTask = {
                taskId: input.task.taskId,
                status: input.task.status,
                summary: input.task.summary,
              };
            } else {
              nextView.recoveryFacts!.lastStableTask = {
                taskId: input.task.taskId,
                status: input.task.status,
                summary: input.task.summary,
              };

              if (nextView.recoveryFacts?.activeTask?.taskId === input.task.taskId) {
                nextView.recoveryFacts!.activeTask = undefined;
              }
            }

            if (input.task.status === "blocked") {
              nextView.recoveryFacts!.blocking = {
                sourceTaskId: input.task.taskId,
                kind: input.task.blockingReason?.kind ?? "human_recovery",
                message: input.task.blockingReason?.message ?? input.task.summary,
              };
            } else if (
              nextView.recoveryFacts?.blocking?.sourceTaskId === input.task.taskId
            ) {
              nextView.recoveryFacts!.blocking = undefined;
            }
          } else if (roles.includes("WorkingSetOnly") && isNonterminalTask(input.task.status)) {
            nextView.recoveryFacts!.activeTask = {
              taskId: input.task.taskId,
              status: input.task.status,
              summary: input.task.summary,
            };
          } else if (
            input.task.status === "cancelled"
            && shouldClearTaskRecoveryState(nextView, input.task)
          ) {
            nextView.recoveryFacts!.activeTask = undefined;
            nextView.recoveryFacts!.blocking = undefined;
          }

          if (roles.includes("NarrativeCandidate")) {
            nextView.narrativeState!.taskSummaries.push(input.task.summary);
            nextView.narrativeState!.threadSummary = composeThreadSummary(nextView.narrativeState!);
          }

          return nextView;
        }

        case "approval": {
          const roles = classifier.classifyApproval(input.approval);
          nextView.recoveryFacts!.pendingApprovals = nextView.recoveryFacts!.pendingApprovals.filter(
            (approval) => approval.approvalRequestId !== input.approval.approvalRequestId,
          );

          if (roles.includes("RecoveryFact")) {
            nextView.recoveryFacts!.pendingApprovals = [
              ...nextView.recoveryFacts!.pendingApprovals,
              {
                approvalRequestId: input.approval.approvalRequestId,
                taskId: input.approval.taskId,
                toolCallId: input.approval.toolCallId,
                summary: input.approval.summary,
                risk: input.approval.risk,
                status: input.approval.status,
              },
            ];
            nextView.recoveryFacts!.blocking = {
              sourceTaskId: input.approval.taskId,
              kind: "waiting_approval",
              message: input.approval.summary,
            };
          } else if (nextView.recoveryFacts?.blocking?.kind === "waiting_approval") {
            nextView.recoveryFacts!.blocking = deriveBlockingFromPendingApprovals(
              nextView.recoveryFacts!,
            );
          }

          return nextView;
        }

        case "answer": {
          const roles = classifier.classifyAnswer(input.summary);

          if (roles.includes("RecoveryFact")) {
            nextView.recoveryFacts!.latestDurableAnswer = {
              answerId: input.answerId,
              summary: input.summary,
            };
          }

          if (roles.includes("NarrativeCandidate")) {
            nextView.narrativeState!.notableEvents.push(input.summary);
          }

          return nextView;
        }

        case "event": {
          const roles = classifier.classifyEvent({
            type: input.eventType,
            summary: input.summary,
          });

          if (roles.includes("RecoveryFact")) {
            const blockingKind =
              input.eventType === "thread.waiting_approval"
                ? "waiting_approval"
                : "human_recovery";
            nextView.recoveryFacts!.blocking = {
              sourceTaskId: input.sourceTaskId ?? "event",
              kind: blockingKind,
              message: input.summary,
            };
          }

          if (roles.includes("NarrativeCandidate")) {
            nextView.narrativeState!.notableEvents.push(input.summary);
          }

          if (roles.includes("WorkingSetOnly")) {
            nextView.workingSetWindow!.messages.push(input.summary);
          }

          return nextView;
        }

        case "tool_result": {
          const roles = classifier.classifyToolResult(input.content);
          if (roles.includes("WorkingSetOnly")) {
            nextView.workingSetWindow!.toolResults.push(input.content);
          }
          if (roles.includes("NarrativeCandidate")) {
            nextView.narrativeState!.notableEvents.push(input.content);
          }
          return nextView;
        }

        case "verifier_feedback": {
          const roles = classifier.classifyVerifierFeedback(input.content);
          if (roles.includes("WorkingSetOnly")) {
            nextView.workingSetWindow!.verifierFeedback.push(input.content);
          }
          return nextView;
        }

        case "message": {
          const roles = classifier.classifyMessage(input.content);
          if (roles.includes("WorkingSetOnly")) {
            nextView.workingSetWindow!.messages.push(input.content);
          }
          return nextView;
        }

        case "retrieved_memory": {
          const roles = classifier.classifyRetrievedMemory(input.content);
          if (roles.includes("WorkingSetOnly")) {
            nextView.workingSetWindow!.retrievedMemories.push(input.content);
          }
          return nextView;
        }
      }
    },
  };
}
