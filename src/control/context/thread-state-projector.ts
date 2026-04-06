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
  | { kind: "transcript_message"; messageId: string; role: "user" | "assistant"; content: string }
  | { kind: "event"; eventType: string; summary: string; sourceTaskId?: string }
  | { kind: "tool_result"; content: string }
  | { kind: "verifier_feedback"; content: string }
  | { kind: "message"; content: string }
  | { kind: "retrieved_memory"; content: string }
  | { 
      kind: "environment"; 
      gitHead?: string; 
      isDirty: boolean; 
      relativeCwd: string; 
      fingerprints: Record<string, string> 
    };

export interface ThreadStateProjector {
  project(view: DerivedThreadView, input: ThreadProjectionInput): DerivedThreadView;
}

export type ThreadStateProjectorOptions = {
  classifier?: ThreadCompactionClassifier;
  schemaVersion?: number;
};

const CURRENT_SCHEMA_VERSION = 1;
const MAX_TRANSCRIPT_MESSAGES = 40;

function cloneRecoveryFacts(input?: RecoveryFacts): RecoveryFacts {
  return {
    threadId: input?.threadId ?? "",
    revision: input?.revision ?? 0,
    schemaVersion: input?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    status: input?.status ?? "active",
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
    environment: input?.environment ? { 
      ...input.environment,
      fingerprints: { ...(input.environment.fingerprints ?? {}) }
    } : undefined,
    ledgerState: input?.ledgerState ? { ...input.ledgerState } : undefined,
    activeTask: input?.activeTask ? { ...input.activeTask } : undefined,
    lastStableTask: input?.lastStableTask ? { ...input.lastStableTask } : undefined,
    blocking: input?.blocking ? { ...input.blocking } : undefined,
    pendingApprovals: (input?.pendingApprovals ?? []).map(a => ({ ...a })),
    conversationHistory: (input?.conversationHistory ?? []).map((message) => ({ ...message })),
    latestDurableAnswer: input?.latestDurableAnswer ? { ...input.latestDurableAnswer } : undefined,
    resumeAnchor: input?.resumeAnchor ? { ...input.resumeAnchor } : undefined,
  };
}

function cloneNarrativeState(input?: NarrativeState): NarrativeState {
  return {
    revision: input?.revision ?? 0,
    threadSummary: input?.threadSummary ?? "",
    taskSummaries: [...(input?.taskSummaries ?? [])],
    openLoops: [...(input?.openLoops ?? [])],
    notableEvents: [...(input?.notableEvents ?? [])],
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
  };
}

function cloneWorkingSetWindow(input?: WorkingSetWindow): WorkingSetWindow {
  return {
    revision: input?.revision ?? 0,
    messages: [...(input?.messages ?? [])],
    toolResults: [...(input?.toolResults ?? [])],
    verifierFeedback: [...(input?.verifierFeedback ?? [])],
    retrievedMemories: [...(input?.retrievedMemories ?? [])],
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
  };
}

function appendThreadSummary(
  currentSummary: string,
  nextItem: string,
): string {
  if (!nextItem) return currentSummary;
  // Deep deduplication: check if the item is already the last part of the summary
  if (currentSummary.endsWith(nextItem)) return currentSummary;
  return currentSummary ? `${currentSummary}; ${nextItem}` : nextItem;
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

function clearContradictoryBlockedActiveTask(
  recoveryFacts: RecoveryFacts,
  taskId: string,
): void {
  if (
    recoveryFacts.activeTask?.taskId === taskId
    && recoveryFacts.activeTask.status === "blocked"
    && recoveryFacts.blocking?.sourceTaskId !== taskId
  ) {
    recoveryFacts.activeTask = undefined;
  }
}

function isTerminalTask(status: ControlTask["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function createThreadStateProjector(
  options: ThreadStateProjectorOptions = {},
): ThreadStateProjector {
  const classifier = options.classifier ?? createThreadCompactionClassifier();
  const schemaVersion = options.schemaVersion ?? CURRENT_SCHEMA_VERSION;

  return {
    project(view, input) {
      const nextView: DerivedThreadView = {
        recoveryFacts: cloneRecoveryFacts(view.recoveryFacts),
        narrativeState: cloneNarrativeState(view.narrativeState),
        workingSetWindow: cloneWorkingSetWindow(view.workingSetWindow),
      };

      if (!nextView.recoveryFacts!.threadId && view.recoveryFacts?.threadId) {
        nextView.recoveryFacts!.threadId = view.recoveryFacts.threadId;
      }

      const now = new Date().toISOString();
      let factChanged = false;
      let narrativeChanged = false;
      let workingSetChanged = false;

      switch (input.kind) {
        case "task": {
          const roles = classifier.classifyTask(input.task);
          factChanged = true;
          
          if (!nextView.recoveryFacts!.threadId) {
            nextView.recoveryFacts!.threadId = input.task.threadId;
          }

          if (isTerminalTask(input.task.status)) {
            nextView.recoveryFacts!.pendingApprovals = nextView.recoveryFacts!.pendingApprovals.filter(
              (approval) => approval.taskId !== input.task.taskId,
            );
          }

          if (input.task.status === "cancelled") {
            if (nextView.recoveryFacts?.activeTask?.taskId === input.task.taskId) {
              nextView.recoveryFacts!.activeTask = undefined;
            }
            if (nextView.recoveryFacts?.blocking?.sourceTaskId === input.task.taskId) {
              nextView.recoveryFacts!.blocking = deriveBlockingFromPendingApprovals(
                nextView.recoveryFacts!,
              );
            }
            break;
          }

          if (isNonterminalTask(input.task.status)) {
            nextView.recoveryFacts!.activeTask = {
              taskId: input.task.taskId,
              status: input.task.status,
              summary: input.task.summary,
            };

            if (input.task.status === "blocked") {
              nextView.recoveryFacts!.blocking = {
                sourceTaskId: input.task.taskId,
                kind: input.task.blockingReason?.kind ?? "human_recovery",
                message: input.task.blockingReason?.message ?? input.task.summary,
              };
            } else if (
              nextView.recoveryFacts?.blocking?.sourceTaskId === input.task.taskId
            ) {
              nextView.recoveryFacts!.blocking = deriveBlockingFromPendingApprovals(
                nextView.recoveryFacts!,
              );
            }
          } else if (roles.includes("RecoveryFact")) {
            nextView.recoveryFacts!.lastStableTask = {
              taskId: input.task.taskId,
              status: input.task.status,
              summary: input.task.summary,
            };

            if (nextView.recoveryFacts?.activeTask?.taskId === input.task.taskId) {
              nextView.recoveryFacts!.activeTask = undefined;
            }

            if (
              nextView.recoveryFacts?.blocking?.sourceTaskId === input.task.taskId
            ) {
              nextView.recoveryFacts!.blocking = deriveBlockingFromPendingApprovals(
                nextView.recoveryFacts!,
              );
            }
          }

          if (roles.includes("NarrativeCandidate")) {
            const lastSummary = nextView.narrativeState!.taskSummaries.at(-1);
            if (input.task.summary !== lastSummary) {
              narrativeChanged = true;
              nextView.narrativeState!.taskSummaries.push(input.task.summary);
              nextView.narrativeState!.threadSummary = appendThreadSummary(
                nextView.narrativeState!.threadSummary,
                input.task.summary,
              );
            }
          }

          break;
        }

        case "approval": {
          const roles = classifier.classifyApproval(input.approval);
          factChanged = true;
          
          if (!nextView.recoveryFacts!.threadId) {
            nextView.recoveryFacts!.threadId = input.approval.threadId;
          }

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
                createdAt: now,
              },
            ];
          }

          nextView.recoveryFacts!.blocking = deriveBlockingFromPendingApprovals(
            nextView.recoveryFacts!,
          );
          clearContradictoryBlockedActiveTask(nextView.recoveryFacts!, input.approval.taskId);

          break;
        }

        case "answer": {
          const roles = classifier.classifyAnswer(input.summary);

          if (roles.includes("RecoveryFact")) {
            factChanged = true;
            nextView.recoveryFacts!.latestDurableAnswer = {
              answerId: input.answerId,
              summary: input.summary,
              createdAt: now,
            };
          }

          if (roles.includes("NarrativeCandidate")) {
            const lastEvent = nextView.narrativeState!.notableEvents.at(-1);
            if (input.summary !== lastEvent) {
              narrativeChanged = true;
              nextView.narrativeState!.notableEvents.push(input.summary);
              nextView.narrativeState!.threadSummary = appendThreadSummary(
                nextView.narrativeState!.threadSummary,
                input.summary,
              );
            }
          }

          break;
        }

        case "transcript_message": {
          factChanged = true;
          nextView.recoveryFacts!.conversationHistory = [
            ...(nextView.recoveryFacts!.conversationHistory ?? []),
            {
              messageId: input.messageId,
              role: input.role,
              content: input.content,
              createdAt: now,
            },
          ].slice(-MAX_TRANSCRIPT_MESSAGES);
          break;
        }

        case "event": {
          const roles = classifier.classifyEvent({
            type: input.eventType,
            summary: input.summary,
          });

          if (roles.includes("RecoveryFact") && input.sourceTaskId) {
            factChanged = true;
            const blockingKind =
              input.eventType === "thread.waiting_approval"
                ? "waiting_approval"
                : "human_recovery";
            nextView.recoveryFacts!.blocking = {
              sourceTaskId: input.sourceTaskId,
              kind: blockingKind,
              message: input.summary,
            };
          }

          if (roles.includes("NarrativeCandidate")) {
            const lastEvent = nextView.narrativeState!.notableEvents.at(-1);
            if (input.summary !== lastEvent) {
              narrativeChanged = true;
              nextView.narrativeState!.notableEvents.push(input.summary);
              nextView.narrativeState!.threadSummary = appendThreadSummary(
                nextView.narrativeState!.threadSummary,
                input.summary,
              );
            }
          }

          if (roles.includes("WorkingSetOnly")) {
            workingSetChanged = true;
            nextView.workingSetWindow!.messages.push(input.summary);
          }

          break;
        }

        case "tool_result": {
          const roles = classifier.classifyToolResult(input.content);
          if (roles.includes("WorkingSetOnly")) {
            workingSetChanged = true;
            nextView.workingSetWindow!.toolResults.push(input.content);
          }
          break;
        }

        case "verifier_feedback": {
          const roles = classifier.classifyVerifierFeedback(input.content);
          if (roles.includes("WorkingSetOnly")) {
            workingSetChanged = true;
            nextView.workingSetWindow!.verifierFeedback.push(input.content);
          }
          break;
        }

        case "message": {
          const roles = classifier.classifyMessage(input.content);
          if (roles.includes("WorkingSetOnly")) {
            workingSetChanged = true;
            nextView.workingSetWindow!.messages.push(input.content);
          }
          break;
        }

        case "retrieved_memory": {
          const roles = classifier.classifyRetrievedMemory(input.content);
          if (roles.includes("WorkingSetOnly")) {
            workingSetChanged = true;
            nextView.workingSetWindow!.retrievedMemories.push(input.content);
          }
          break;
        }

        case "environment": {
          factChanged = true;
          nextView.recoveryFacts!.environment = {
            gitHead: input.gitHead,
            isDirty: input.isDirty,
            relativeCwd: input.relativeCwd,
            fingerprints: { ...input.fingerprints }
          };
          break;
        }
      }

      if (factChanged) {
        nextView.recoveryFacts!.revision += 1;
        nextView.recoveryFacts!.updatedAt = now;
        nextView.recoveryFacts!.schemaVersion = schemaVersion;
      }
      if (narrativeChanged) {
        nextView.narrativeState!.revision += 1;
        nextView.narrativeState!.updatedAt = now;
      }
      if (workingSetChanged) {
        nextView.workingSetWindow!.revision += 1;
        nextView.workingSetWindow!.updatedAt = now;
      }

      return nextView;
    },
  };
}
